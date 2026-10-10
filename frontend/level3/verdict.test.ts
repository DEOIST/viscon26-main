import { describe, expect, it } from "vitest";
import { loadBest, saveBest, swissGrade, verdictFor } from "./verdict";
import type { BestRun } from "./verdict";

describe("verdictFor", () => {
    it("ranks a finished defense by accuracy", () => {
        expect(verdictFor(false, 97).title).toBe("SUMMA CUM LAUDE");
        expect(verdictFor(false, 85).title).toBe("THESIS DEFENDED");
        expect(verdictFor(false, 70).title).toBe("CONDITIONAL PASS");
        expect(verdictFor(false, 40).title).toBe("MAJOR REVISIONS REQUIRED");
    });

    it("destroys a failed defense whatever the accuracy", () => {
        expect(verdictFor(true, 99).title).toBe("ACADEMICALLY DESTROYED");
    });
});

describe("swissGrade", () => {
    it("maps accuracy onto ETH's 1–6 scale in quarter steps", () => {
        expect(swissGrade(false, 100)).toBe(6);
        expect(swissGrade(false, 0)).toBe(1);
        expect(swissGrade(false, 61)).toBe(4);
        expect(swissGrade(false, 86)).toBe(5.25);
    });

    it("never passes a failed defense", () => {
        expect(swissGrade(true, 99)).toBe(3.75);
        expect(swissGrade(true, 10)).toBe(1.5);
    });
});

function memoryStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => {
            data[key] = value;
        },
    };
}

describe("personal best", () => {
    const run: BestRun = { score: 42_000, accuracy: 88.5, maxCombo: 77 };

    it("keeps the higher score and says when it is new", () => {
        const storage = memoryStorage();
        expect(loadBest(storage)).toBeNull();
        expect(saveBest(storage, run)).toEqual({ best: run, isNew: true });
        const worse = { ...run, score: 100 };
        expect(saveBest(storage, worse)).toEqual({ best: run, isNew: false });
        expect(loadBest(storage)).toEqual(run);
    });

    it("ignores corrupt or tampered storage", () => {
        for (const raw of ["{", "null", '{"score":"9"}', '{"score":-5}'])
            expect(
                loadBest(
                    memoryStorage({ "eth-life:thesis-defense:best": raw }),
                ),
            ).toBeNull();
    });

    it("survives storage that throws (private mode)", () => {
        const broken = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        };
        expect(loadBest(broken)).toBeNull();
        expect(saveBest(broken, run)).toEqual({ best: run, isNew: true });
    });
});
