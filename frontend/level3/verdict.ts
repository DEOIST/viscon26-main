// The committee's verdict by ETH grade, the grade itself and the personal best, all pure. The best run is
// kept in the browser's localStorage: it is a bragging number, not progress, so it never
// goes to the server.

import { BEST_KEY } from "./config";
import { TEXT } from "../src/misc/text";

export interface Verdict {
    title: string;
    line: string;
    career: string; // "Career forecast" on the verdict card
    color: string;
}

// One verdict per band of the ETH scale (1–6, 4 passes), best first. The words are in
// shared/text.json (thesisDefense.verdicts); the ink colour follows how the band reads.
const VERDICT_TEXT = TEXT.thesisDefense.verdicts;
const INK = {
    top: "#ffd84a",
    good: "#9dff4a",
    pass: "#3ee0ff",
    short: "#ffb43c",
    fail: "#ff4f6d",
};

function tiers(
    entries: { min: number; title: string; line: string; career: string }[],
    color: (min: number) => string,
): { min: number; verdict: Verdict }[] {
    return entries.map(({ min, ...words }) => ({
        min,
        verdict: { ...words, color: color(min) },
    }));
}

const PASSED = tiers(VERDICT_TEXT.passed, (min) =>
    min >= 5.75 ? INK.top : min >= 5 ? INK.good : INK.pass,
);
const NOT_PASSED = tiers(VERDICT_TEXT.notPassed, (min) =>
    min >= 3 ? INK.short : INK.fail,
);
const DESTROYED = tiers(VERDICT_TEXT.destroyed, () => INK.fail);

// The verdict follows the ETH grade; a defense that ran out of confidence is always destroyed.
export function verdictFor(failed: boolean, grade: number): Verdict {
    const tiers = failed ? DESTROYED : grade >= 4 ? PASSED : NOT_PASSED;
    return (tiers.find((tier) => grade >= tier.min) ?? tiers[tiers.length - 1])
        .verdict;
}

// ETH grades run from 1 to 6 in quarter steps; 4 passes. A failed defense never passes.
export function swissGrade(failed: boolean, accuracy: number): number {
    const grade = Math.round((1 + (5 * accuracy) / 100) * 4) / 4;
    return failed ? Math.min(3.75, grade) : grade;
}

// --- Personal best ----------------------------------------------------------

export interface BestRun {
    score: number;
    accuracy: number;
    maxCombo: number;
}

export interface BestStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function isBestRun(value: unknown): value is BestRun {
    if (typeof value !== "object" || value === null) return false;
    const run = value as Record<string, unknown>;
    return ["score", "accuracy", "maxCombo"].every(
        (key) =>
            typeof run[key] === "number" &&
            Number.isFinite(run[key]) &&
            (run[key] as number) >= 0,
    );
}

export function loadBest(storage: BestStorage): BestRun | null {
    try {
        const parsed: unknown = JSON.parse(storage.getItem(BEST_KEY) ?? "null");
        return isBestRun(parsed)
            ? {
                  score: parsed.score,
                  accuracy: parsed.accuracy,
                  maxCombo: parsed.maxCombo,
              }
            : null;
    } catch {
        return null; // corrupt JSON or storage disabled: start a fresh record
    }
}

export function saveBest(
    storage: BestStorage,
    run: BestRun,
): { best: BestRun; isNew: boolean } {
    const previous = loadBest(storage);
    if (previous && previous.score >= run.score)
        return { best: previous, isNew: false };
    try {
        storage.setItem(BEST_KEY, JSON.stringify(run));
    } catch {
        // Private mode or a full quota: the record still counts for this session.
    }
    return { best: run, isNew: true };
}
