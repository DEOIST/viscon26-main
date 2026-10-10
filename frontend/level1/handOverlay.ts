// The crosshair and the neon hand skeleton, redrawn every frame on top of the round. The
// skeleton proves to the judges at a glance that the hand is really tracked.

import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import type { GameObjects } from "phaser";
import type { AimPoint, InputSource } from "./input/InputSource";

// MediaPipe's 21-point hand: the bones of the skeleton.
const HAND_BONES: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]; // prettier-ignore
const NEON = 0x4fe3ff;
const AIMING = 0xf2c14e;
const NOT_AIMING = 0x8a8f99;

// `aim` is where to draw the crosshair: the input's aim, glided in camera mode (glide.ts).
export function drawHandOverlay(
    graphics: GameObjects.Graphics,
    input: InputSource,
    aim: AimPoint | null,
) {
    graphics.clear();
    if (input.landmarks) drawSkeleton(graphics, input.landmarks);
    if (!aim) return;
    const x = aim.x * GAME_WIDTH;
    const y = aim.y * GAME_HEIGHT;
    graphics.lineStyle(4, input.tracking === "ok" ? AIMING : NOT_AIMING, 1);
    graphics.strokeCircle(x, y, 26);
    graphics.lineBetween(x - 40, y, x - 12, y);
    graphics.lineBetween(x + 12, y, x + 40, y);
    graphics.lineBetween(x, y - 40, x, y - 12);
    graphics.lineBetween(x, y + 12, x, y + 40);
}

function drawSkeleton(
    graphics: GameObjects.Graphics,
    landmarks: readonly AimPoint[],
) {
    const points = landmarks.map((point) => ({
        x: point.x * GAME_WIDTH,
        y: point.y * GAME_HEIGHT,
    }));
    graphics.lineStyle(5, NEON, 0.85);
    for (const [from, to] of HAND_BONES)
        graphics.lineBetween(
            points[from].x,
            points[from].y,
            points[to].x,
            points[to].y,
        );
    graphics.fillStyle(0xffffff, 0.9);
    for (const point of points) graphics.fillCircle(point.x, point.y, 5);
}
