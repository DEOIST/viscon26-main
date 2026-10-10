// Frontend build. Every src/pages/<name>.tsx becomes one page:
//   dist/<name>.html          (generated from template.html)
//   dist/pages/<name>.js|css  (the bundle; shared code is split into dist/pages/chunks/)
//   dist/assets/*             (imported images/fonts)
//   dist/static/*             (copied as-is from public/)
//
//   node build.js          dev build (sourcemaps, unminified)
//   node build.js -w       dev build, then watch: rebuilds on save, picks up new/removed pages
//   node build.js --prod   minified production build
//
// esbuild strips types WITHOUT checking them. Run `npx tsc --noEmit` to typecheck.

import * as esbuild from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const PAGES_DIR = path.join(ROOT, "src", "pages");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "dist");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "template.html"), "utf8");

// The finger-detection engine (backend/app/services/cv.py) reads the hand model from
// dist/static/models/, so the build fetches it once; nothing comes from a CDN at the venue.
const HAND_MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const HAND_MODEL_PATH = path.join(PUBLIC_DIR, "models", "hand_landmarker.task");
// Pinned so a tampered or truncated file never reaches the server's native runtime. Change it
// together with the URL (`shasum -a 256 hand_landmarker.task`).
const HAND_MODEL_SHA256 =
    "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";

const flags = process.argv.slice(2);
const watch = flags.includes("-w") || flags.includes("--watch");
const prod = flags.includes("--prod");

function findPages() {
    return fs
        .readdirSync(PAGES_DIR)
        .filter((file) => file.endsWith(".tsx"))
        .map((file) => path.basename(file, ".tsx"))
        .sort();
}

function writeHtml(pages) {
    for (const page of pages) {
        const hasCss = fs.existsSync(
            path.join(OUT_DIR, "pages", `${page}.css`),
        );
        const cssTag = hasCss
            ? `<link rel="stylesheet" href="/pages/${page}.css" />`
            : "";
        const html = TEMPLATE.replaceAll("{{page}}", page).replace(
            "{{css}}",
            cssTag,
        );
        fs.writeFileSync(path.join(OUT_DIR, `${page}.html`), html);
    }
    // Drop HTML for pages that were deleted since the last build.
    for (const file of fs.readdirSync(OUT_DIR)) {
        if (
            file.endsWith(".html") &&
            !pages.includes(path.basename(file, ".html"))
        ) {
            fs.rmSync(path.join(OUT_DIR, file));
        }
    }
}

function copyPublic() {
    fs.cpSync(PUBLIC_DIR, path.join(OUT_DIR, "static"), { recursive: true });
}

// The hand model (7.8 MB) is above CI's 5 MB file limit, so it is downloaded once into the
// git-ignored public/models/ instead of being committed. Without it the engine reports itself
// unavailable and the shooter uses the mouse; a file that fails the checksum stops the build.
async function ensureHandModel() {
    if (fs.existsSync(HAND_MODEL_PATH)) {
        if (sha256(fs.readFileSync(HAND_MODEL_PATH)) === HAND_MODEL_SHA256)
            return;
        console.warn(
            "[build] the hand model on disk fails its checksum; downloading it again",
        );
        fs.rmSync(HAND_MODEL_PATH);
    }
    let model;
    try {
        const res = await fetch(HAND_MODEL_URL, {
            signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        model = Buffer.from(await res.arrayBuffer());
    } catch (err) {
        console.warn(
            `[build] could not download the hand model (${err.message}); the shooter falls back to the mouse`,
        );
        return;
    }
    if (sha256(model) !== HAND_MODEL_SHA256)
        throw new Error(
            "[build] the downloaded hand model doesn't match its pinned SHA-256; refusing to use it",
        );
    fs.mkdirSync(path.dirname(HAND_MODEL_PATH), { recursive: true });
    fs.writeFileSync(HAND_MODEL_PATH, model);
    console.log(
        "[build] downloaded the MediaPipe hand model (checksum verified)",
    );
}

function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function afterBuildPlugin(pages) {
    return {
        name: "after-build",
        setup(build) {
            let startedAt = 0;
            build.onStart(() => {
                startedAt = performance.now();
            });
            build.onEnd((result) => {
                if (result.errors.length > 0) return;
                writeHtml(pages);
                copyPublic();
                const ms = Math.round(performance.now() - startedAt);
                console.log(
                    `[build] ${pages.length} page(s) in ${ms}ms: ${pages.join(", ")}`,
                );
            });
        },
    };
}

function buildOptions(pages) {
    return {
        entryPoints: Object.fromEntries(
            pages.map((page) => [
                `pages/${page}`,
                path.join(PAGES_DIR, `${page}.tsx`),
            ]),
        ),
        outdir: OUT_DIR,
        bundle: true,
        splitting: true,
        format: "esm",
        chunkNames: "pages/chunks/[name]-[hash]",
        assetNames: "assets/[name]-[hash]",
        publicPath: "/",
        loader: {
            ".png": "file",
            ".jpg": "file",
            ".jpeg": "file",
            ".gif": "file",
            ".webp": "file",
            ".svg": "file",
            ".woff2": "file",
            ".mp3": "file",
            ".ogg": "file",
            ".wav": "file",
            ".m4a": "file",
        },
        jsx: "automatic",
        target: "es2022",
        sourcemap: !prod,
        minify: prod,
        define: {
            "process.env.NODE_ENV": JSON.stringify(
                prod ? "production" : "development",
            ),
        },
        logLevel: "warning",
        plugins: [afterBuildPlugin(pages)],
    };
}

async function main() {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    await ensureHandModel();
    let pages = findPages();

    if (!watch) {
        await esbuild.build(buildOptions(pages));
        return;
    }

    let ctx = await esbuild.context(buildOptions(pages));
    await ctx.watch();

    // esbuild only watches files it already knows about, so restart it when a page is added/removed.
    let restarting = Promise.resolve();
    fs.watch(PAGES_DIR, () => {
        restarting = restarting.then(async () => {
            const next = findPages();
            if (next.join() === pages.join()) return;
            pages = next;
            await ctx.dispose();
            ctx = await esbuild.context(buildOptions(pages));
            await ctx.watch();
        });
    });
    fs.watch(PUBLIC_DIR, { recursive: true }, () => copyPublic());

    console.log("[build] watching for changes... (Ctrl-C to stop)");
}

main().catch((err) => {
    // esbuild prints its own build errors; anything else we print here.
    if (!err?.errors) console.error(err);
    process.exitCode = 1;
});
