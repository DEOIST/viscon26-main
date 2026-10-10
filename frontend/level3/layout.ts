// Where things sit on the shared 1280 x 720 canvas. The screen is a PDF viewer showing one
// page of your thesis: toolbar on top, page thumbnails on the left, the white sheet in the
// middle (the lanes are Figure 3.1 on it), the viewer's properties pane on the right.
// The figure is flat, like anything typeset: notes slide straight down at constant speed.

import { NOTE_LEAD_MS } from "./config";

export const WIDTH = 1280;
export const HEIGHT = 720;
// Backgrounds are drawn this far past the frame: fullscreen expands the canvas to the
// screen's shape (Scale.EXPAND), and the extra room shows more viewer, never empty bands.
export const BLEED = 700;

// Viewer chrome.
export const TOOLBAR_H = 44;
export const SIDEBAR_W = 196;
export const PANEL_X = 1072; // the viewer's properties pane starts here

// The sheet of paper, cut off by the bottom of the screen like a scrolled PDF.
export const PAGE = { x: 220, y: 60, w: 830 } as const;
export const COLUMN = { x: PAGE.x + 52, w: 520 } as const; // text column holding the figure
export const MARGIN = { x: COLUMN.x + COLUMN.w + 26, w: 220 } as const; // margin notes

// Figure 3.1: the four lanes.
export const FIGURE_TOP = 178; // \toprule: notes appear here
export const HIT_Y = 590; // the rule to answer on
export const LANE_WIDTH = COLUMN.w / 4;
export const PAST_LINE_MS = 185; // how long a late note stays visible below the rule

// 0 when a note appears at the top rule, 1 when it is on the hit rule, above 1 once late.
export function progress(noteTime: number, now: number): number {
    return 1 - (noteTime - now) / NOTE_LEAD_MS;
}

// Constant speed: the figure is a table, not a road.
export function noteY(p: number): number {
    return FIGURE_TOP + (HIT_Y - FIGURE_TOP) * p;
}

export function laneX(lane: number): number {
    return COLUMN.x + (lane + 0.5) * LANE_WIDTH;
}
