import { describe, expect, it } from "vitest";
import { shooterScore, shotPoints } from "./score";

describe("shooterScore", () => {
    it("scales points against par (420 points = 100)", () => {
        expect(shooterScore(0)).toBe(0);
        expect(shooterScore(210)).toBe(50);
        expect(shooterScore(420)).toBe(100);
    });

    it("rounds half up and clamps to 0–100", () => {
        expect(shooterScore(2.1)).toBe(1); // 0.5 → 1
        expect(shooterScore(-30)).toBe(0);
        expect(shooterScore(9000)).toBe(100);
    });
});

describe("shotPoints", () => {
    it("pays the target's points", () => {
        expect(shotPoints("question", 0)).toBe(10);
        expect(shotPoints("deadline", 0)).toBe(25);
        expect(shotPoints("coffee", 0)).toBe(0);
    });

    it("adds a combo bonus from the third hit in a row", () => {
        expect(shotPoints("question", 1)).toBe(10); // this is the 2nd hit in a row
        expect(shotPoints("question", 2)).toBe(15); // the 3rd
    });

    it("costs points for a miss", () => {
        expect(shotPoints(null, 5)).toBe(-2);
    });
});
