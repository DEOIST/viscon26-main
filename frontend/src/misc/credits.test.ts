import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GAMES, TOTAL_ECTS, YEARS, endingFor } from "../config";
import { calculateEcts } from "../store";
import { creditSummary, gameEcts } from "./credits";

const originalFlags = GAMES.map((game) => game.implemented);
beforeEach(() => GAMES.forEach((game) => (game.implemented = true)));
afterEach(() =>
    GAMES.forEach((game, index) => (game.implemented = originalFlags[index])),
);

describe("gameEcts", () => {
    it("pays a game's ECTS in proportion to its score, rounded half up", () => {
        const game = { ...GAMES[0], ects: 60 };
        expect(gameEcts(game, 100)).toBe(60);
        expect(gameEcts(game, 86)).toBe(52); // 51.6
        expect(gameEcts(game, 75)).toBe(45);
        expect(gameEcts(game, 0)).toBe(0);
        expect(gameEcts(game, undefined)).toBe(60); // older saves without a score
    });
});

describe("creditSummary", () => {
    it("lists every year's game with what it can pay before anything is played", () => {
        const summary = creditSummary([], {});
        expect(summary.rows).toHaveLength(GAMES.length);
        expect(summary.rows[0]).toMatchObject({
            yearTitle: YEARS[0].title,
            gameTitle: GAMES[0].title,
            available: GAMES[0].ects,
            earned: null,
            score: null,
        });
        expect(summary.earned).toBe(0);
        expect(summary.total).toBe(TOTAL_ECTS);
        expect(summary.percent).toBe(0);
    });

    it("adds the rows up to exactly the degree's ECTS and its career", () => {
        const ids = GAMES.map((game) => game.id);
        const scores = { [ids[0]]: 86, [ids[1]]: 70, [ids[2]]: 95 };
        const summary = creditSummary(ids, scores);
        const sum = summary.rows.reduce(
            (total, row) => total + (row.earned ?? 0),
            0,
        );
        expect(summary.earned).toBe(sum);
        expect(summary.earned).toBe(calculateEcts(ids, scores));
        expect(summary.ending).toEqual(endingFor(summary.earned));
        expect(summary.rows.map((row) => row.score)).toEqual([86, 70, 95]);
    });

    it("marks each career's threshold on the scale and what the next one needs", () => {
        const ids = [GAMES[0].id];
        const summary = creditSummary(ids, { [ids[0]]: 50 }); // 30 ECTS so far
        expect(summary.thresholds.map((t) => t.ects)).toEqual(
            [...summary.thresholds.map((t) => t.ects)].sort((a, b) => a - b),
        );
        expect(summary.thresholds[0].ects).toBe(0);
        expect(summary.next).not.toBeNull();
        expect(summary.next!.ectsNeeded).toBe(summary.next!.ects - 30);
        expect(summary.next!.ectsNeeded).toBeGreaterThan(0);
    });

    it("has no next career once the top one is reached", () => {
        const ids = GAMES.map((game) => game.id);
        const perfect = Object.fromEntries(ids.map((id) => [id, 100]));
        const summary = creditSummary(ids, perfect);
        expect(summary.earned).toBe(TOTAL_ECTS);
        expect(summary.percent).toBe(100);
        expect(summary.next).toBeNull();
    });
});
