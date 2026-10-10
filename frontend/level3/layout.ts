// Where things sit on the shared 1280 x 720 canvas, and the highway's fake perspective.
// Notes travel along a straight line in depth: screen size goes with 1 / distance, so they
// creep out from under the committee's desk and rush at the hit line, like a real road.

import { NOTE_LEAD_MS } from "./config";

export const WIDTH = 1280;
export const HEIGHT = 720;
export const CENTER_X = WIDTH / 2;

export const HORIZON_Y = 112; // vanishing point of the highway, hidden behind the desk
export const HIT_Y = 612; // the hit line
export const LANE_WIDTH = 132; // at the hit line
export const FAR = 4; // spawn distance, in hit-line units: notes appear at 1/FAR size
export const MAX_PROGRESS = 1.12; // how far past the hit line a note is still drawn

export const DESK_Y = 205; // top edge of the committee's desk
export const PROFESSORS_X = [430, 640, 850];
export const PROFESSOR_Y = 150;

export const HUD_LEFT_X = 160;
export const HUD_RIGHT_X = 1120;

// 0 when a note spawns, 1 when it is on the hit line, above 1 once it is late.
export function progress(noteTime: number, now: number): number {
    return 1 - (noteTime - now) / NOTE_LEAD_MS;
}

// Screen scale for a progress value: 1/FAR at spawn, 1 at the hit line.
export function depthScale(p: number): number {
    const distance = FAR - (FAR - 1) * Math.min(p, MAX_PROGRESS);
    return 1 / distance;
}

export function screenY(scale: number): number {
    return HORIZON_Y + (HIT_Y - HORIZON_Y) * scale;
}

export function laneX(lane: number, scale: number): number {
    return CENTER_X + (lane - 1.5) * LANE_WIDTH * scale;
}
