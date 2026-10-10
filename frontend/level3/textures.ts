// The thesis world's materials: the PDF viewer's greys, white paper, black Computer Modern
// type, highlighter ink, red and blue ballpoint. Fonts are self-hosted (OFL, assets/fonts/)
// and loaded before the scene draws; textures are drawn on canvases, no image files ship.

import type { GameObjects, Scene, Textures, Types } from "phaser";
import caveatBold from "./assets/fonts/caveat-bold.woff2";
import caveatMedium from "./assets/fonts/caveat-medium.woff2";
import sourceCodePro from "./assets/fonts/source-code-pro.woff2";
import serifBold from "./assets/fonts/source-serif-bold.woff2";
import serifItalic from "./assets/fonts/source-serif-italic.woff2";
import serifRegular from "./assets/fonts/source-serif-regular.woff2";

// Source Serif 4 reads like a typeset thesis and stays sturdy on a projector; Caveat is the
// committee's pen; Source Code Pro sets file names and LaTeX source.
export const SERIF = '"Source Serif 4", Georgia, serif';
export const MONO = '"Source Code Pro", Menlo, monospace';
export const HAND = '"Caveat", "Bradley Hand", cursive';

export const COLORS = {
    toolbar: 0x323639,
    ground: 0x525659,
    paper: 0xffffff,
    ink: 0x1b1b1b,
    redPen: 0xd11a2a,
    bluePen: 0x1f3c9b,
    selection: 0x8ab4f8,
    gold: 0xfff23a,
};

export const CSS = {
    ink: "#1b1b1b",
    inkSoft: "#555555",
    redPen: "#d11a2a",
    bluePen: "#1f3c9b",
    chrome: "#f1f3f4",
    chromeMuted: "#bdc1c6",
};

const FACES: [string, string, string, string][] = [
    ["Source Serif 4", serifRegular, "400", "normal"],
    ["Source Serif 4", serifBold, "700", "normal"],
    ["Source Serif 4", serifItalic, "400", "italic"],
    ["Source Code Pro", sourceCodePro, "400", "normal"],
    ["Caveat", caveatMedium, "400", "normal"],
    ["Caveat", caveatBold, "700", "normal"],
];

// Loads every face once per page; resolves even if a face fails (the fallbacks still read).
let fontsReady: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
    if (fontsReady) return fontsReady;
    if (typeof FontFace === "undefined" || !document.fonts) {
        fontsReady = Promise.resolve();
        return fontsReady;
    }
    fontsReady = Promise.all(
        FACES.map(async ([family, url, weight, style]) => {
            try {
                const face = new FontFace(family, `url(${url})`, {
                    weight,
                    style,
                });
                document.fonts.add(await face.load());
            } catch {
                // A missing face falls back to the next family in the stack.
            }
        }),
    ).then(() => undefined);
    return fontsReady;
}

function canvas(
    scene: Scene,
    key: string,
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
) {
    if (scene.textures.exists(key)) return;
    const texture = scene.textures.createCanvas(key, w, h);
    if (!texture) return;
    draw(texture.getContext());
    texture.refresh();
}

// A tiny deterministic random, so every pen and marker stroke looks hand-made but stable.
export function seeded(seed: number): () => number {
    let x = Math.abs(Math.floor(seed)) % 2147483647 || 1;
    return () => {
        x = (x * 1103515245 + 12345) % 2147483648;
        return x / 2147483648;
    };
}

// White highlighter stroke (tinted per lane): streaky body, ragged ends, slightly uneven
// edges, the way a chisel-tip marker actually lays ink.
function drawHighlighter(ctx: CanvasRenderingContext2D, seed: number) {
    const w = 256;
    const h = 64;
    const random = seeded(seed);
    for (let x = 0; x < w; x++) {
        const fade = Math.min(1, Math.min(x, w - x) / 12);
        const top = 7 + random() * 4 + (1 - fade) * 8 * random();
        const bottom = h - 7 - random() * 4 - (1 - fade) * 8 * random();
        const alpha = (0.8 + random() * 0.16) * Math.max(0.3, fade);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fillRect(x, top, 1, bottom - top);
    }
    // Where the felt tip pressed harder.
    for (const band of [0.3, 0.68]) {
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(12, h * band, w - 24, 3);
    }
}

export function makeTextures(scene: Scene) {
    [11, 23, 37].forEach((seed, i) =>
        canvas(scene, `td-marker-${i}`, 256, 64, (ctx) =>
            drawHighlighter(ctx, seed),
        ),
    );
    canvas(scene, "td-dot", 8, 8, (ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(4, 4, 3.2, 0, Math.PI * 2);
        ctx.fill();
    });
}

// A ballpoint line: slightly wobbly, so pen marks never look like vector rules.
export function penLine(
    g: GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    wobble = 1.2,
    seed = 1,
) {
    const random = seeded(seed * 7919 + 13);
    const steps = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 14));
    g.beginPath();
    g.moveTo(x1, y1);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const jitter = i === steps ? 0 : (random() - 0.5) * 2 * wobble;
        g.lineTo(x1 + (x2 - x1) * t + jitter, y1 + (y2 - y1) * t + jitter);
    }
    g.strokePath();
}

// A ballpoint ellipse (circling something), drawn as a slightly open, wobbly loop.
export function penCircle(
    g: GameObjects.Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    seed = 1,
) {
    const random = seeded(seed * 104729 + 7);
    const start = random() * Math.PI * 2;
    g.beginPath();
    for (let i = 0; i <= 28; i++) {
        const a = start + (i / 26) * Math.PI * 2;
        const wob = 1 + (random() - 0.5) * 0.08;
        const x = cx + Math.cos(a) * rx * wob;
        const y = cy + Math.sin(a) * ry * wob;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
    }
    g.strokePath();
}

// Text is rasterised at this resolution; the scene raises it to its camera zoom.
export const TEXT = { resolution: 2 };

// Shared text styles.
export function serif(
    size: number,
    color = CSS.ink,
    style: "normal" | "bold" | "italic" = "normal",
): Types.GameObjects.Text.TextStyle {
    return {
        fontFamily: SERIF,
        fontSize: `${size}px`,
        fontStyle: style,
        color,
        resolution: TEXT.resolution,
    };
}

export function hand(
    size: number,
    color = CSS.redPen,
    bold = false,
): Types.GameObjects.Text.TextStyle {
    return {
        fontFamily: HAND,
        // Caveat runs small for its size; this keeps the pen as legible as the layout expects.
        fontSize: `${Math.round(size * 1.22)}px`,
        fontStyle: bold ? "bold" : "normal",
        color,
        resolution: TEXT.resolution,
    };
}

// --- The committee's rubber stamp ---------------------------------------------

const STAMP_W = 620;
const STAMP_H = 220;

// Splits a verdict into at most two balanced lines, so long ones are never shrunk.
export function stampLines(
    title: string,
    fits: (line: string) => boolean,
): string[] {
    if (fits(title)) return [title];
    const words = title.split(" ");
    let best = [title];
    let bestGap = Infinity;
    for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" ");
        const b = words.slice(i).join(" ");
        const gap = Math.abs(a.length - b.length);
        if (gap < bestGap) {
            bestGap = gap;
            best = [a, b];
        }
    }
    return best;
}

// Draws the verdict as a real ink impression: rough double border, uneven pressure across the
// face, and voids where the rubber did not take ink. Redrawn on the one "td-stamp" texture.
export function drawStamp(
    scene: Scene,
    title: string,
    seed: number,
): { w: number; h: number; lines: number } {
    const texture =
        (scene.textures.exists("td-stamp") && scene.textures.get("td-stamp")) ||
        scene.textures.createCanvas("td-stamp", STAMP_W, STAMP_H);
    if (!texture || !("getContext" in texture))
        return { w: STAMP_W, h: STAMP_H, lines: 1 };
    const ctx = (texture as Textures.CanvasTexture).getContext();
    const random = seeded(seed);
    ctx.clearRect(0, 0, STAMP_W, STAMP_H);
    const size = 46;
    ctx.font = `bold ${size}px ${SERIF}`;
    const lines = stampLines(
        title,
        (line) => ctx.measureText(line).width <= 420,
    );
    const textW = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const w = Math.min(STAMP_W - 16, textW + 96);
    const h = lines.length === 1 ? 104 : 160;
    const x0 = (STAMP_W - w) / 2;
    const y0 = (STAMP_H - h) / 2;
    ctx.strokeStyle = CSS.redPen;
    ctx.fillStyle = CSS.redPen;
    // Rough rectangle: every edge walks with a little jitter.
    const rough = (inset: number, width: number) => {
        ctx.lineWidth = width;
        ctx.beginPath();
        const corners = [
            [x0 + inset, y0 + inset],
            [x0 + w - inset, y0 + inset],
            [x0 + w - inset, y0 + h - inset],
            [x0 + inset, y0 + h - inset],
        ];
        corners.forEach(([cx, cy], i) => {
            const [nx, ny] = corners[(i + 1) % 4];
            for (let s = 0; s <= 12; s++) {
                const t = s / 12;
                const x = cx + (nx - cx) * t + (random() - 0.5) * 1.6;
                const y = cy + (ny - cy) * t + (random() - 0.5) * 1.6;
                if (i === 0 && s === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        });
        ctx.closePath();
        ctx.stroke();
    };
    rough(4, 6);
    rough(14, 2.2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineH = size * 1.08;
    lines.forEach((line, i) => {
        const y = STAMP_H / 2 + (i - (lines.length - 1) / 2) * lineH + 2;
        ctx.fillText(line, STAMP_W / 2, y);
    });
    // Uneven pressure: one side of the stamp pressed lighter.
    ctx.globalCompositeOperation = "destination-out";
    const side = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    const light = random() < 0.5;
    side.addColorStop(0, `rgba(0,0,0,${light ? 0.35 : 0})`);
    side.addColorStop(1, `rgba(0,0,0,${light ? 0 : 0.35})`);
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, STAMP_W, STAMP_H);
    // Voids: specks and a few drag streaks where no ink took.
    for (let i = 0; i < 520; i++) {
        ctx.fillStyle = `rgba(0,0,0,${(0.45 + random() * 0.55).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(
            x0 + random() * w,
            y0 + random() * h,
            0.5 + random() * 1.9,
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }
    for (let i = 0; i < 7; i++) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(
            x0 + random() * w,
            y0 + random() * h,
            18 + random() * 50,
            1 + random() * 1.5,
        );
    }
    ctx.globalCompositeOperation = "source-over";
    (texture as Textures.CanvasTexture).refresh();
    return { w: STAMP_W, h: STAMP_H, lines: lines.length };
}
