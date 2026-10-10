import { describe, expect, it } from "vitest";
import { loadBest, saveBest, swissGrade, verdictFor } from "./verdict";
import type { BestRun } from "./verdict";

describe("verdictFor", () => {
    it("gives every passing ETH grade its own verdict", () => {
        expect(verdictFor(false, 6).title).toBe("SUMMA CUM LAUDE");
        expect(verdictFor(false, 5.75).title).toBe("MAGNA CUM LAUDE");
        expect(verdictFor(false, 5.25).title).toBe("THESIS DEFENDED");
        expect(verdictFor(false, 4.5).title).toBe("CONDITIONAL PASS");
        expect(verdictFor(false, 4).title).toBe("4.0 IS A PASS");
        const passing = [6, 5.75, 5.5, 5.25, 5, 4.75, 4.5, 4.25, 4];
        const titles = passing.map((grade) => verdictFor(false, grade).title);
        expect(new Set(titles).size).toBe(passing.length);
    });

    it("keeps failing grades apart from a destroyed defense", () => {
        expect(verdictFor(false, 3.75).title).toBe("SO CLOSE");
        expect(verdictFor(false, 3.25).title).toBe("MAJOR REVISIONS REQUIRED");
        expect(verdictFor(false, 1).title).toBe("EXMATRIKULIERT");
        expect(verdictFor(true, 3.5).title).toBe("ACADEMICALLY DESTROYED");
        expect(verdictFor(true, 1.25).title).toBe(
            "SENT BACK TO THE BASISPRÜFUNG",
        );
    });

    it("forecasts a career for every grade on the scale", () => {
        for (let grade = 1; grade <= 6; grade += 0.25)
            for (const failed of [false, true]) {
                const verdict = verdictFor(failed, grade);
                expect(verdict.line.length).toBeGreaterThan(10);
                expect(verdict.career.length).toBeGreaterThan(5);
                expect(verdict.color).toMatch(/^#[0-9a-f]{6}$/);
            }
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
