import { describe, expect, it } from "vitest";
import { NOTE_LEAD_MS } from "./config";
import {
    CENTER_X,
    DESK_Y,
    FAR,
    HIT_Y,
    LANE_WIDTH,
    depthScale,
    laneX,
    progress,
    screenY,
} from "./layout";

describe("highway perspective", () => {
    it("spawns notes small under the desk and lands them on the hit line", () => {
        expect(progress(5000, 5000 - NOTE_LEAD_MS)).toBe(0);
        expect(progress(5000, 5000)).toBe(1);
        expect(depthScale(0)).toBeCloseTo(1 / FAR);
        expect(depthScale(1)).toBe(1);
        expect(screenY(depthScale(1))).toBe(HIT_Y);
        expect(screenY(depthScale(0))).toBeGreaterThan(DESK_Y - 20);
    });

    it("moves faster the closer a note gets, and stops growing past the line", () => {
        const step = (p: number) =>
            screenY(depthScale(p + 0.1)) - screenY(depthScale(p));
        expect(step(0.8)).toBeGreaterThan(step(0.2));
        expect(depthScale(5)).toBe(depthScale(1.12));
    });

    it("spreads the four lanes symmetrically around the centre", () => {
        expect(laneX(0, 1)).toBe(CENTER_X - 1.5 * LANE_WIDTH);
        expect(laneX(3, 1)).toBe(CENTER_X + 1.5 * LANE_WIDTH);
        expect(laneX(1, 0.5) + laneX(2, 0.5)).toBe(2 * CENTER_X);
    });
});
