import { describe, expect, it } from "vitest";
import { boxForAspect, isSameBox } from "./box";
import type { Box } from "./box";

const DEFAULT_BOX: Box = [0.2, 0.15, 0.8, 0.75];
const GAME_ASPECT = 16 / 9;

function pixelAspect(box: Box, cameraAspect: number): number {
    return ((box[2] - box[0]) * cameraAspect) / (box[3] - box[1]);
}

describe("boxForAspect", () => {
    it("gives a 4:3 camera's box the game's 16:9 shape, so the video isn't stretched", () => {
        const box = boxForAspect(DEFAULT_BOX, 4 / 3, GAME_ASPECT);

        expect(pixelAspect(box, 4 / 3)).toBeCloseTo(GAME_ASPECT);
        expect(box[0]).toBe(0.2); // the width and the centre stay
        expect(box[2]).toBe(0.8);
        expect((box[1] + box[3]) / 2).toBeCloseTo(0.45);
    });

    it("leaves a box that already fits a 16:9 camera alone", () => {
        expect(
            isSameBox(
                boxForAspect(DEFAULT_BOX, 16 / 9, GAME_ASPECT),
                DEFAULT_BOX,
            ),
        ).toBe(true);
    });

    it("keeps a tall box inside the camera image", () => {
        const box = boxForAspect([0.1, 0.0, 0.9, 0.3], 3, GAME_ASPECT);

        expect(box[1]).toBeGreaterThanOrEqual(0);
        expect(box[3]).toBeLessThanOrEqual(1);
        expect(box[3] - box[1]).toBeLessThanOrEqual(1);
    });

    it("ignores a camera whose size is still unknown", () => {
        expect(boxForAspect(DEFAULT_BOX, Number.NaN, GAME_ASPECT)).toEqual(
            DEFAULT_BOX,
        );
        expect(boxForAspect(DEFAULT_BOX, 0, GAME_ASPECT)).toEqual(DEFAULT_BOX);
        expect(boxForAspect(DEFAULT_BOX, Infinity, GAME_ASPECT)).toEqual(
            DEFAULT_BOX,
        ); // width known, height not yet
    });
});

describe("isSameBox", () => {
    it("tolerates rounding on the way through JSON", () => {
        expect(
            isSameBox(
                [0.2, 0.225, 0.8, 0.675],
                [0.2, 0.2250000001, 0.8, 0.675],
            ),
        ).toBe(true);
        expect(isSameBox([0.2, 0.225, 0.8, 0.675], DEFAULT_BOX)).toBe(false);
    });
});
