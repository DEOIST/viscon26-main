import { describe, expect, it } from "vitest";
import { hitTest } from "./hitTest";

const paper = { id: 1, x: 100, y: 100, radius: 50, depth: 300 };
const clock = { id: 2, x: 140, y: 100, radius: 50, depth: 800 }; // nearer, overlapping

describe("hitTest", () => {
    it("hits the target under the shot", () => {
        expect(hitTest({ x: 80, y: 110 }, [paper])).toBe(1);
    });

    it("counts the edge of the disc as a hit", () => {
        expect(hitTest({ x: 150, y: 100 }, [paper])).toBe(1);
    });

    it("misses when the shot is outside every target", () => {
        expect(hitTest({ x: 151, y: 100 }, [paper])).toBeNull();
        expect(hitTest({ x: 0, y: 0 }, [])).toBeNull();
    });

    it("hits the nearest of overlapping targets, whatever the list order", () => {
        expect(hitTest({ x: 120, y: 100 }, [paper, clock])).toBe(2);
        expect(hitTest({ x: 120, y: 100 }, [clock, paper])).toBe(2);
    });
});
