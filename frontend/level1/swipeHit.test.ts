import { describe, expect, it } from "vitest";
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import { swipeHits } from "./swipeHit";
import type { CvSlide } from "./input/cvStream";

const slide: CvSlide = {
    direction: "right",
    radius: 0.012,
    path: [
        [0.2, 0.5],
        [0.6, 0.5],
    ],
    outlines: [
        [
            [0.1, 0.3],
            [0.3, 0.3],
            [0.3, 0.7],
            [0.1, 0.7],
        ],
        [
            [0.5, 0.3],
            [0.7, 0.3],
            [0.7, 0.7],
            [0.5, 0.7],
        ],
    ],
};

describe("whole-hand swipe contact", () => {
    it("hits palm-covered targets away from the centroid path", () => {
        expect(swipeHits(slide, 0.2 * GAME_WIDTH, 0.35 * GAME_HEIGHT, 5)).toBe(
            true,
        );
    });
    it("hits targets crossed between camera frames", () => {
        expect(swipeHits(slide, 0.4 * GAME_WIDTH, 0.4 * GAME_HEIGHT, 5)).toBe(
            true,
        );
    });
    it("leaves distant targets untouched", () => {
        expect(swipeHits(slide, 0.9 * GAME_WIDTH, 0.5 * GAME_HEIGHT, 5)).toBe(
            false,
        );
        expect(swipeHits(slide, 0.4 * GAME_WIDTH, 0.1 * GAME_HEIGHT, 5)).toBe(
            false,
        );
    });
    it("supports older streams with only a path", () => {
        const legacy = { ...slide, outlines: undefined };
        expect(swipeHits(legacy, 0.4 * GAME_WIDTH, 0.5 * GAME_HEIGHT, 5)).toBe(
            true,
        );
        expect(swipeHits(legacy, 0.4 * GAME_WIDTH, 0.1 * GAME_HEIGHT, 5)).toBe(
            false,
        );
    });
});
