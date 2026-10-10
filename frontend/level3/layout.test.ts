import { describe, expect, it } from "vitest";
import { NOTE_LEAD_MS } from "./config";
import {
    COLUMN,
    FIGURE_TOP,
    HIT_Y,
    LANE_WIDTH,
    MARGIN,
    PAGE,
    PANEL_X,
    SIDEBAR_W,
    WIDTH,
    laneX,
    noteY,
    progress,
} from "./layout";

describe("figure geometry", () => {
    it("slides notes from the top rule to the hit rule at constant speed", () => {
        expect(progress(5000, 5000 - NOTE_LEAD_MS)).toBe(0);
        expect(progress(5000, 5000)).toBe(1);
        expect(noteY(0)).toBe(FIGURE_TOP);
        expect(noteY(1)).toBe(HIT_Y);
        expect(noteY(0.75) - noteY(0.5)).toBeCloseTo(noteY(0.25) - noteY(0));
    });

    it("splits the text column into four equal lanes", () => {
        expect(laneX(0)).toBe(COLUMN.x + LANE_WIDTH / 2);
        expect(laneX(3)).toBe(COLUMN.x + COLUMN.w - LANE_WIDTH / 2);
    });

    it("keeps sheet, margin and panels from overlapping", () => {
        expect(PAGE.x).toBeGreaterThan(SIDEBAR_W);
        expect(MARGIN.x).toBeGreaterThan(COLUMN.x + COLUMN.w);
        expect(MARGIN.x + MARGIN.w).toBeLessThanOrEqual(PAGE.x + PAGE.w);
        expect(PAGE.x + PAGE.w).toBeLessThan(PANEL_X);
        expect(PANEL_X).toBeLessThan(WIDTH);
    });
});
