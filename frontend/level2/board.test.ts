import { describe, expect, it } from "vitest";
import { BOARD, restY } from "./board";

const bottom = BOARD.floor - BOARD.ballRadius;

describe("where a ball rests", () => {
    it("stacks a column at the normal pitch while it fits under the bars", () => {
        expect(restY(0, 1)).toBe(bottom);
        expect(restY(3, 4)).toBe(bottom - 3 * BOARD.slotPitch);
        expect(restY(8, 9)).toBe(bottom - 8 * BOARD.slotPitch);
    });

    it.each([10, 13, 20, 40])(
        "packs %i balls tighter so none rises above the bars",
        (count) => {
            const top = restY(count - 1, count) - BOARD.ballRadius;
            expect(top).toBeGreaterThanOrEqual(BOARD.barTop - 1e-6);
            expect(restY(0, count)).toBe(bottom); // the first ball stays on the floor
            expect(restY(1, count)).toBeLessThan(bottom); // and the others still stack up
        },
    );
});
