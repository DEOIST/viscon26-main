// Sprite sheets from ./assets (atlas JSON next to each PNG), plus the few textures generated
// here as stand-ins until real art exists: felt, neutral falling ball, avatars and particle
// shapes. The normal curve is drawn in code (BoardView) so it can follow the tuned rules in
// board.ts.
//
// Each PNG import is a hashed URL and each JSON import is the parsed atlas, which Phaser's
// loader accepts in place of a URL. That works unchanged in both bundlers (esbuild and Vite).

import type { Scene } from "phaser";
import {
    AVATAR_PARTS,
    AVATAR_TEXTURE,
    avatarKey,
    avatarLayers,
    VIEW,
} from "./avatar";
import type { AvatarLook, AvatarPart } from "./avatar";
import {
    AVATAR_TEXTURE_SCALE,
    BLACKJACK_YELLOWS,
    DEALER_STANDS_AT,
} from "./config";
import { BELT, CENTER, HEIGHT, WIDTH } from "./layout";

import backJson from "./assets/back.json";
import backPng from "./assets/back.png";
import ballsJson from "./assets/balls.json";
import ballsPng from "./assets/balls.png";
import chipsJson from "./assets/chips.json";
import chipsPng from "./assets/chips.png";
import framesJson from "./assets/frames.json";
import framesPng from "./assets/frames.png";
import boardsJson from "./assets/gaussian.json";
import boardsPng from "./assets/gaussian.png";
import numbersJson from "./assets/numbers.json";
import numbersPng from "./assets/numbers.png";
import peopleJson from "./assets/people.json";
import peoplePng from "./assets/people.png";
import facesJson from "./assets/symbol_faces.json";
import facesPng from "./assets/symbol_faces.png";
import symbolsJson from "./assets/symbols.json";
import symbolsPng from "./assets/symbols.png";

const ATLASES: [string, string, object][] = [
    ["balls", ballsPng, ballsJson],
    ["back", backPng, backJson],
    ["chips", chipsPng, chipsJson],
    ["faces", facesPng, facesJson],
    ["frames", framesPng, framesJson],
    ["boards", boardsPng, boardsJson],
    ["numbers", numbersPng, numbersJson],
    ["people", peoplePng, peopleJson],
    ["symbols", symbolsPng, symbolsJson],
];

export const BALL_FRAMES = {
    red: "ball1_9",
    yellow: "ball2_9",
    green: "ball3_9",
} as const;
export const COLORS = {
    red: 0xee5a78,
    yellow: 0xffc94d,
    green: 0x6ccfa6,
    navy: 0x3d3f6b,
    gold: 0xf5c451,
};

export function loadAssets(scene: Scene) {
    for (const [key, png, json] of ATLASES) scene.load.atlas(key, png, json);
}

// The player's character: the loader rasterizes one SVG per part (avatar.ts), then
// packAvatar() copies them into a single texture with one frame per part, so the avatar costs
// one texture binding however many parts it has.
export function loadAvatar(scene: Scene, look: AvatarLook) {
    const size = {
        width: VIEW.w * AVATAR_TEXTURE_SCALE,
        height: VIEW.h * AVATAR_TEXTURE_SCALE,
    };
    for (const [part, svg] of Object.entries(avatarLayers(look))) {
        if (!svg) continue;
        // Phaser's loader reads every data URL as base64; the markup is plain ASCII.
        const url = `data:image/svg+xml;base64,${btoa(svg)}`;
        scene.load.svg(avatarKey(part as AvatarPart), url, size);
    }
}

// Returns false when the parts did not load (the seat then shows the stand-in portrait).
export function packAvatar(scene: Scene): boolean {
    const parts = AVATAR_PARTS.filter((part) =>
        scene.textures.exists(avatarKey(part)),
    );
    if (scene.textures.exists(AVATAR_TEXTURE)) return true;
    if (!parts.includes("head") || !parts.includes("body")) return false;
    const w = VIEW.w * AVATAR_TEXTURE_SCALE;
    const h = VIEW.h * AVATAR_TEXTURE_SCALE;
    const columns = 6;
    const texture = scene.textures.createCanvas(
        AVATAR_TEXTURE,
        columns * w,
        Math.ceil(parts.length / columns) * h,
    );
    if (!texture) return false;
    const ctx = texture.getContext();
    parts.forEach((part, i) => {
        const x = (i % columns) * w;
        const y = Math.floor(i / columns) * h;
        const source = scene.textures.get(avatarKey(part)).getSourceImage();
        ctx.drawImage(source as CanvasImageSource, x, y, w, h);
        texture.add(part, 0, x, y, w, h);
        scene.textures.remove(avatarKey(part));
    });
    texture.refresh();
    return true;
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

export function makeTextures(scene: Scene) {
    canvas(scene, "felt", WIDTH, HEIGHT, drawFelt);

    // Matches the 80 x 80 ball frames (30 px ball) so it can swap to a coloured one on landing.
    canvas(scene, "ball-neutral", 80, 80, (ctx) => {
        const g = ctx.createRadialGradient(35, 34, 2, 40, 40, 15);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(1, "#d9dcef");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(40, 40, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#3d3f6b";
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.ellipse(35, 34, 4, 2.5, -0.6, 0, Math.PI * 2);
        ctx.fill();
    });

    canvas(scene, "dot", 16, 16, (ctx) => {
        const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 16, 16);
    });

    canvas(scene, "spark", 24, 24, (ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.quadraticCurveTo(13.5, 10.5, 24, 12);
        ctx.quadraticCurveTo(13.5, 13.5, 12, 24);
        ctx.quadraticCurveTo(10.5, 13.5, 0, 12);
        ctx.quadraticCurveTo(10.5, 10.5, 12, 0);
        ctx.fill();
    });

    canvas(scene, "confetti", 8, 14, (ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 8, 14);
    });

    canvas(scene, "avatar-dealer", 200, 200, (ctx) =>
        drawAvatar(ctx, "#8e2f45", "#c9566f"),
    );
    canvas(scene, "avatar-player", 200, 200, (ctx) =>
        drawAvatar(ctx, "#2d3a7a", "#4f63c2"),
    );
    // The empty portrait the player's character sits in (PlayerAvatar).
    canvas(scene, "avatar-frame", 200, 200, (ctx) =>
        drawAvatar(ctx, "#2d3a7a", "#4f63c2", false),
    );

    canvas(scene, "tear", 14, 20, (ctx) => {
        ctx.fillStyle = "#8fd3ff";
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.quadraticCurveTo(14, 10, 14, 13);
        ctx.arc(7, 13, 7, 0, Math.PI);
        ctx.quadraticCurveTo(0, 10, 7, 0);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.beginPath();
        ctx.ellipse(5, 13, 1.6, 2.6, 0.3, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawFelt(ctx: CanvasRenderingContext2D) {
    const { x: cx, y: cy } = CENTER;
    const base = ctx.createRadialGradient(cx, cy - 30, 80, cx, cy, 1060);
    base.addColorStop(0, "#23a15a");
    base.addColorStop(0.55, "#137a40");
    base.addColorStop(1, "#06361c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Felt grain.
    const image = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < image.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 14;
        image.data[i] += n;
        image.data[i + 1] += n;
        image.data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);

    // Table markings: a belt across the top with the house rules in gold.
    const { x, y, radius } = BELT;
    const span = 0.47; // radians either side of straight down
    ctx.strokeStyle = "rgba(245, 196, 81, 0.55)";
    ctx.lineWidth = 3;
    for (const r of [radius - 42, radius + 58]) {
        ctx.beginPath();
        ctx.arc(x, y, r, Math.PI / 2 - span, Math.PI / 2 + span);
        ctx.stroke();
    }
    arcText(
        ctx,
        `BLACKJACK · ${BLACKJACK_YELLOWS} YELLOW BALLS · PAYS 3 TO 2`,
        x,
        y,
        radius - 4,
        "rgba(245, 196, 81, 0.85)",
        25,
    );
    arcText(
        ctx,
        `DEALER DRAWS BELOW ${DEALER_STANDS_AT} BALLS · ANY RED BALL BUSTS`,
        x,
        y,
        radius + 30,
        "rgba(255, 255, 255, 0.4)",
        17,
    );

    const vignette = ctx.createRadialGradient(cx, cy, 460, cx, cy, 1080);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

// Writes `text` left to right along the bottom of a circle centred at (cx, cy).
function arcText(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    radius: number,
    color: string,
    size: number,
) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `800 ${size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const widths = [...text].map(
        (ch) => ctx.measureText(ch).width + size * 0.08,
    );
    const total = widths.reduce((a, b) => a + b, 0);
    let angle = Math.PI / 2 + total / radius / 2;
    [...text].forEach((ch, i) => {
        const a = angle - widths[i] / radius / 2;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.rotate(a - Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        angle -= widths[i] / radius;
    });
    ctx.restore();
}

function drawAvatar(
    ctx: CanvasRenderingContext2D,
    dark: string,
    light: string,
    silhouette = true,
) {
    const g = ctx.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(100, 100, 92, 0, Math.PI * 2);
    ctx.fill();

    if (silhouette) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(100, 100, 92, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = "rgba(255, 246, 236, 0.92)";
        ctx.beginPath();
        ctx.arc(100, 82, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(100, 182, 62, 52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.lineWidth = 8;
    ctx.strokeStyle = "#f5c451";
    ctx.beginPath();
    ctx.arc(100, 100, 92, 0, Math.PI * 2);
    ctx.stroke();
}
