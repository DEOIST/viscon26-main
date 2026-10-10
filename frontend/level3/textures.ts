// Every texture of the defense is drawn here on canvases, so the level ships no image files:
// the lecture hall, the question notes per lane, golden notes and the particle shapes.

import type { Scene } from "phaser";
import { LANE_CSS, LANE_GLYPHS } from "./config";
import { HEIGHT, WIDTH } from "./layout";

export const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';
export const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
export const NOTE_W = 124;
export const NOTE_H = 62;

export const COLORS = {
    ink: 0x070b1f,
    ethBlue: 0x215caf,
    gold: 0xffd84a,
    red: 0xff4f6d,
    white: 0xffffff,
};

// Formulas on the chalkboard behind the committee.
const CHALK = [
    "∀ε>0 ∃δ>0",
    "P ≟ NP",
    "∇·E = ρ/ε₀",
    "p = 0.051 :(",
    "O(n log n)",
    "λx. x x",
    "E[X] = Σ x·p(x)",
    "git push --force",
    "∂L/∂θ = 0 ?",
    "det(A) ≠ 0 ⇒ hope",
    "sudo make thesis",
    "lim coffee(n) = ∞",
];

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

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawHall(ctx: CanvasRenderingContext2D) {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#0b1233");
    sky.addColorStop(0.45, "#090d24");
    sky.addColorStop(1, "#04060f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Tiered lecture-hall seats rising to both sides.
    for (let row = 0; row < 9; row++) {
        const y = 250 + row * 52;
        const inset = 330 - row * 30;
        ctx.fillStyle = `rgba(80, 110, 200, ${0.05 + row * 0.012})`;
        ctx.fillRect(0, y, inset, 18);
        ctx.fillRect(WIDTH - inset, y, inset, 18);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(0, y, inset, 2);
        ctx.fillRect(WIDTH - inset, y, inset, 2);
    }

    // The chalkboard, wider than the desk, with half-wiped formulas.
    const board = { x: 230, y: 18, w: 820, h: 178 };
    ctx.fillStyle = "#13261f";
    roundRect(ctx, board.x - 10, board.y - 10, board.w + 20, board.h + 20, 10);
    ctx.fill();
    ctx.fillStyle = "#1b3a2f";
    ctx.fillRect(board.x, board.y, board.w, board.h);
    const smudge = ctx.createRadialGradient(640, 100, 20, 640, 100, 420);
    smudge.addColorStop(0, "rgba(255,255,255,0.07)");
    smudge.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = smudge;
    ctx.fillRect(board.x, board.y, board.w, board.h);
    ctx.font = `18px ${MONO}`;
    ctx.textBaseline = "middle";
    CHALK.forEach((text, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        ctx.fillStyle = `rgba(235, 245, 235, ${0.16 + ((i * 7) % 5) * 0.035})`;
        ctx.save();
        ctx.translate(
            board.x + 30 + col * 270 + (row % 2) * 34,
            board.y + 30 + row * 42,
        );
        ctx.rotate((((i * 13) % 7) - 3) * 0.01);
        ctx.fillText(text, 0, 0);
        ctx.restore();
    });
}

function drawNote(
    ctx: CanvasRenderingContext2D,
    color: string,
    glyph: string,
    gold: boolean,
) {
    const pad = 6;
    const w = NOTE_W - pad * 2;
    const h = NOTE_H - pad * 2;
    ctx.shadowColor = gold ? "#ffd84a" : color;
    ctx.shadowBlur = 10;
    const fill = ctx.createLinearGradient(0, pad, 0, pad + h);
    if (gold) {
        fill.addColorStop(0, "#fff6c2");
        fill.addColorStop(0.5, "#ffd84a");
        fill.addColorStop(1, "#c98a12");
    } else {
        fill.addColorStop(0, "#ffffff");
        fill.addColorStop(0.18, color);
        fill.addColorStop(1, "#141a3a");
    }
    ctx.fillStyle = fill;
    roundRect(ctx, pad, pad, w, h, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = gold ? "#fffbe0" : "rgba(255,255,255,0.85)";
    roundRect(ctx, pad + 1.5, pad + 1.5, w - 3, h - 3, 13);
    ctx.stroke();
    ctx.fillStyle = gold ? "#4a2d00" : "#ffffff";
    ctx.font = `900 30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(gold ? `★ ${glyph}` : glyph, NOTE_W / 2, NOTE_H / 2 + 1);
}

export function makeTextures(scene: Scene) {
    canvas(scene, "td-hall", WIDTH, HEIGHT, drawHall);
    LANE_CSS.forEach((color, lane) => {
        canvas(scene, `td-note-${lane}`, NOTE_W, NOTE_H, (ctx) =>
            drawNote(ctx, color, LANE_GLYPHS[lane], false),
        );
        canvas(scene, `td-gold-${lane}`, NOTE_W, NOTE_H, (ctx) =>
            drawNote(ctx, color, LANE_GLYPHS[lane], true),
        );
    });
    canvas(scene, "td-glow", 128, 128, (ctx) => {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.35, "rgba(255,255,255,0.45)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
    });
    canvas(scene, "td-spark", 24, 24, (ctx) => {
        const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.4, "rgba(255,255,255,0.8)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 24, 24);
    });
    canvas(scene, "td-shard", 10, 4, (ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 10, 4);
    });
    // A vertical beam for lane presses: bright at the bottom, gone at the top.
    canvas(scene, "td-beam", 64, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 256, 0, 0);
        g.addColorStop(0, "rgba(255,255,255,0.9)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 256);
    });
}
