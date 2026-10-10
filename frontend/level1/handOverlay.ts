// A filled cartoon hand follows the landmarks, with rounded fingers and a solid palm.
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import { Math as PhaserMath } from "phaser";
import type { GameObjects } from "phaser";
import type { AimPoint, InputSource } from "./input/InputSource";

const FINGERS = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
];
const SKIN = 0xeebc96;
const OUTLINE = 0x714c40;
const NAIL = 0xffdfca;
const CREASE = 0xc78d71;

// The hand itself is the interaction guide; no crosshair or fingertip cursor.
export function drawHandOverlay(
    graphics: GameObjects.Graphics,
    input: InputSource,
    _aim: AimPoint | null,
) {
    graphics.clear();
    if (input.landmarks?.length === 21) drawHand(graphics, input.landmarks);
}

function drawHand(
    graphics: GameObjects.Graphics,
    landmarks: readonly AimPoint[],
) {
    const points = landmarks.map((point) => ({
        x: point.x * GAME_WIDTH,
        y: point.y * GAME_HEIGHT,
    }));
    const wrist = points[0];
    const knuckles = points[9];
    const palmWidth = Math.hypot(
        points[5].x - points[17].x,
        points[5].y - points[17].y,
    );
    if (palmWidth < 3) return;
    const length = Math.hypot(knuckles.x - wrist.x, knuckles.y - wrist.y) || 1;
    const across = {
        x: -(knuckles.y - wrist.y) / length,
        y: (knuckles.x - wrist.x) / length,
    };
    const cuffWidth = palmWidth * 0.26;
    const palm = [
        {
            x: wrist.x + across.x * cuffWidth,
            y: wrist.y + across.y * cuffWidth,
        },
        ...[1, 2, 5, 9, 13, 17].map((index) => points[index]),
        {
            x: wrist.x - across.x * cuffWidth,
            y: wrist.y - across.y * cuffWidth,
        },
    ].map((point) => new PhaserMath.Vector2(point.x, point.y));
    const widths = [0.22, 0.19, 0.2, 0.18, 0.15].map((size) =>
        Math.max(6, palmWidth * size),
    );
    const border = Math.max(2, palmWidth * 0.025);

    // Draw all borders first, then the skin, so joints merge instead of looking like tubes.
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillPoints(palm, true);
    graphics.lineStyle(border * 2, OUTLINE, 1);
    graphics.strokePoints(palm, true);
    for (let finger = 0; finger < FINGERS.length; finger += 1)
        drawFinger(
            graphics,
            points,
            FINGERS[finger],
            widths[finger] + border * 2,
            OUTLINE,
        );
    graphics.fillStyle(SKIN, 1);
    graphics.fillPoints(palm, true);
    for (let finger = 0; finger < FINGERS.length; finger += 1)
        drawFinger(graphics, points, FINGERS[finger], widths[finger], SKIN);

    // Small nail-shaped highlights make the finger ends readable without landmark dots.
    for (let finger = 0; finger < FINGERS.length; finger += 1) {
        const chain = FINGERS[finger];
        const tip = points[chain[3]];
        const joint = points[chain[2]];
        const nailBase = {
            x: tip.x + (joint.x - tip.x) * 0.25,
            y: tip.y + (joint.y - tip.y) * 0.25,
        };
        drawCapsule(graphics, nailBase, tip, widths[finger] * 0.48, NAIL);
    }
    graphics.lineStyle(border, CREASE, 0.65);
    graphics.lineBetween(
        points[5].x * 0.6 + wrist.x * 0.4,
        points[5].y * 0.6 + wrist.y * 0.4,
        points[17].x * 0.65 + wrist.x * 0.35,
        points[17].y * 0.65 + wrist.y * 0.35,
    );
}

function drawFinger(
    graphics: GameObjects.Graphics,
    points: readonly AimPoint[],
    chain: readonly number[],
    width: number,
    color: number,
) {
    for (let segment = 0; segment < chain.length - 1; segment += 1)
        drawCapsule(
            graphics,
            points[chain[segment]],
            points[chain[segment + 1]],
            width * (1 - segment * 0.1),
            color,
        );
}

function drawCapsule(
    graphics: GameObjects.Graphics,
    from: AimPoint,
    to: AimPoint,
    width: number,
    color: number,
) {
    graphics.lineStyle(width, color, 1);
    graphics.lineBetween(from.x, from.y, to.x, to.y);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(from.x, from.y, width / 2);
    graphics.fillCircle(to.x, to.y, width / 2);
}
