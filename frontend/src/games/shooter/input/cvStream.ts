// The finger-detection engine's wire protocol (backend/app/routers/cv.py), seen from the browser.
// The stream is an input device like the camera, so it lives here and not in misc/apiClient.ts.

import type { CvFrame } from "../../../misc/CommonInt";
import type { Box } from "./box";

export type CvMessage =
    | { type: "ready"; box: Box }
    | { type: "settings"; cooldownMs: number }
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
