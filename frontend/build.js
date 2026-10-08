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
import fs from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const PAGES_DIR = path.join(ROOT, "src", "pages");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "dist");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "template.html"), "utf8");

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
