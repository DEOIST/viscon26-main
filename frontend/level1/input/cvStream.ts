// The finger-detection engine's wire protocol (backend/level1/router.py, types mirrored from
// backend/level1/schemas.py), seen from the browser. The stream is an input device like the
// camera, so it lives here with the game (level 1) and not in src/.

import type { Box } from "./box";

// calibrating: the hand is in view and the engine waits for the finger gun to be held still.
export type Tracking = "ok" | "noPose" | "lost" | "calibrating";
export type GamePoint = [number, number]; // [x, y] in the game area, 0..1

// One processed camera frame from /api/cv/stream.
export interface CvFrame {
    type: "frame";
    tracking: Tracking;
    aim: GamePoint | null;
    firedAt: GamePoint | null; // set on the frame a shot fires
    landmarks: GamePoint[] | null; // 21 points for drawing the hand; may lie outside 0..1
    thumbAngle: number | null; // degrees from straight up (cocked < 32, fires > 55), for tuning
    processingMs: number;
}

// Control messages the browser sends; the engine answers a bad one with {type: "error", detail}.
export interface CvBoxMessage {
    type: "box";
    box: [number, number, number, number]; // mirrored camera image 0..1; each side ≥ 0.1
}
export interface CvSettingsMessage {
    type: "settings";
    cooldownMs: number; // 0–2000
}
export interface CvRecenterMessage {
    type: "recenter"; // calibrate the aim's neutral position again
}
// Trigger calibration: "up"/"down" collect the thumb in that position, "done" applies the result,
// "reset" restores the default trigger.
export type TriggerStep = "up" | "down" | "done" | "reset";
export interface CvTriggerMessage {
    type: "trigger";
    step: TriggerStep;
}
export interface CvTriggerReply {
    type: "trigger";
    step: TriggerStep;
    ok: boolean; // false when "done" couldn't tell up from down; the previous trigger stays
    detail: string | null; // why not, for the player
    thresholds: {
        cockedBelowDeg: number;
        firedAboveDeg: number;
        uprightAbove: number;
        foldedBelow: number;
    };
}
export interface CvRecordMessage {
    type: "record";
    on: boolean; // development servers only: saves the frames to backend/captures/
}

export type CvMessage =
    | { type: "ready"; box: Box }
    | { type: "settings"; cooldownMs: number }
    | { type: "record"; on: boolean; dir: string | null } // dir: where the server saves frames
    | { type: "recenter" }
    | CvTriggerReply
    | { type: "error"; detail: string }
    | CvFrame;

const BUSY = 1013;
const UNAVAILABLE = 1011;
const IDLE = 4000; // no frames for a while, e.g. the tab was hidden

export function cvStreamUrl(pageUrl: string): string {
    const url = new URL("/api/cv/stream", pageUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
}

export function closeMessage(code: number, reason: string): string {
    if (code === BUSY) return "the finger-detection engine is busy";
    if (code === UNAVAILABLE)
        return reason || "the finger-detection engine is unavailable";
    if (code === IDLE) return "the camera stopped sending frames";
    return "the connection to the finger-detection engine was lost";
}

export function cameraErrorMessage(error: unknown): string {
    if (error instanceof DOMException) {
        if (error.name === "NotAllowedError")
            return "camera permission was denied";
        if (error.name === "NotFoundError") return "no camera was found";
        if (error.name === "NotReadableError")
            return "the camera is in use by another app";
    }
    return error instanceof Error ? error.message : String(error);
}
