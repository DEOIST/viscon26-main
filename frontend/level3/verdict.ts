// The committee's verdict, the ETH grade and the personal best, all pure. The best run is
// kept in the browser's localStorage: it is a bragging number, not progress, so it never
// goes to the server.

import { BEST_KEY } from "./config";
import { TEXT } from "../src/misc/text";

const VERDICT_TEXT = TEXT.thesisDefense.verdicts;

export interface Verdict {
    title: string;
    line: string;
    color: string;
}

const VERDICTS: { min: number; verdict: Verdict }[] = [
    {
        min: 93,
        verdict: { ...VERDICT_TEXT.summaCumLaude, color: "#ffd84a" },
    },
    {
        min: 80,
        verdict: { ...VERDICT_TEXT.defended, color: "#9dff4a" },
    },
    {
        min: 65,
        verdict: { ...VERDICT_TEXT.conditionalPass, color: "#3ee0ff" },
    },
    {
        min: 0,
        verdict: { ...VERDICT_TEXT.majorRevisions, color: "#ffb43c" },
    },
];

const DESTROYED: Verdict = { ...VERDICT_TEXT.destroyed, color: "#ff4f6d" };

export function verdictFor(failed: boolean, accuracy: number): Verdict {
    if (failed) return DESTROYED;
    return VERDICTS.find((tier) => accuracy >= tier.min)!.verdict;
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
