// What the shooter scene reads every frame, whatever drives it: the finger-detection engine
// (ServerHandInput) or the mouse (MouseInput). See docs/SHOOTER_CV.md → Input abstraction.

import type { Tracking } from "../../../misc/CommonInt";

export interface AimPoint {
    x: number; // game area, 0..1
    y: number;
}

export interface InputSource {
    readonly mode: "camera" | "mouse";
    readonly aim: AimPoint | null;
    readonly tracking: Tracking;
    readonly landmarks: AimPoint[] | null; // 21 points (camera only), for the hand skeleton
    takeShots(): AimPoint[]; // shots since the last call; the scene polls every frame
    destroy(): void;
}
