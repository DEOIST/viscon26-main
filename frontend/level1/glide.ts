// The crosshair glides toward each answer of the finger-detection engine (~30 per second) at
// display rate instead of stepping, which reads as jitter on a 60 fps screen. Display only: shots
// land where the engine says (firedAt), never where the glide happens to be.

import { CROSSHAIR_GLIDE_MS } from "./config";
import type { AimPoint } from "./input/InputSource";

export function glideAim(
    shown: AimPoint | null,
    target: AimPoint | null,
    deltaMs: number,
): AimPoint | null {
    if (!target || !shown) return target;
    const step = 1 - Math.exp(-deltaMs / CROSSHAIR_GLIDE_MS);
    return {
        x: shown.x + (target.x - shown.x) * step,
        y: shown.y + (target.y - shown.y) * step,
    };
}
