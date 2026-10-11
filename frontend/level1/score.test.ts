import { describe, expect, it } from "vitest";
import { addPoints, shooterScore, shotPoints } from "./score";

describe("shooterScore", () => {
    it("scales points against par (163 points = 100)", () => {
        expect(shooterScore(0)).toBe(0);
        expect(shooterScore(81.5)).toBe(50);
        expect(shooterScore(163)).toBe(100);
    });

    it("rounds half up and clamps to 0–100", () => {
        expect(shooterScore(20.375)).toBe(13); // 12.5 → 13
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

describe("addPoints", () => {
    it("adds gains and takes penalties", () => {
        expect(addPoints(40, 15)).toBe(55);
        expect(addPoints(40, -15)).toBe(25);
    });

    it("never drops below zero, so later catches always count", () => {
        expect(addPoints(10, -15)).toBe(0);
        let total = 0;
        for (const delta of [-5, -15, -2, -5]) total = addPoints(total, delta);
        expect(total).toBe(0);
        expect(shooterScore(addPoints(total, 10))).toBeGreaterThan(0);
    });
});
