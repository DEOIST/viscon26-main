// The committee's verdict by ETH grade, the grade itself and the personal best, all pure. The best run is
// kept in the browser's localStorage: it is a bragging number, not progress, so it never
// goes to the server.

import { BEST_KEY } from "./config";

export interface Verdict {
    title: string;
    line: string;
    career: string; // "Career forecast" on the verdict card
    color: string;
}

// One verdict per band of the ETH scale (1–6, 4 passes), best first.
const PASSED: { min: number; verdict: Verdict }[] = [
    {
        min: 6,
        verdict: {
            title: "SUMMA CUM LAUDE",
            line: "A perfect 6.0. The committee suspects ChatGPT. Prof. Lemma is crying.",
            career: "Professor at 27, burnout at 28",
            color: "#ffd84a",
        },
    },
    {
        min: 5.75,
        verdict: {
            title: "MAGNA CUM LAUDE",
            line: 'Offered a PhD on the spot. You said "I\'ll think about it" and ran for the Polybahn.',
            career: "PhD at ETH: free coffee, no sunlight",
            color: "#ffd84a",
        },
    },
    {
        min: 5.5,
        verdict: {
            title: "CUM LAUDE",
            line: "Your parents print the diploma twice. One for the fridge, one for the WhatsApp group.",
            career: "Quant in Zug, tax-optimised happiness",
            color: "#9dff4a",
        },
    },
    {
        min: 5.25,
        verdict: {
            title: "THESIS DEFENDED",
            line: '"Solid work." The highest praise ever recorded in HG E 41.',
            career: "Google Zürich, the office with the slide",
            color: "#9dff4a",
        },
    },
    {
        min: 5,
        verdict: {
            title: "A VERY SWISS 5.0",
            line: "Efficient, punctual, slightly boring. Like the S-Bahn.",
            career: "Bank IT: three meetings, one line of code a day",
            color: "#9dff4a",
        },
    },
    {
        min: 4.75,
        verdict: {
            title: "RESPECTABLE",
            line: "Good enough for industry. Not good enough for your Lerngruppe's group chat.",
            career: "Startup at the ETH incubator, pivoting weekly",
            color: "#3ee0ff",
        },
    },
    {
        min: 4.5,
        verdict: {
            title: "CONDITIONAL PASS",
            line: "Pass, if you fix the typo on page 3. And chapter 4. And the title.",
            career: "Consultant: slides about slides",
            color: "#3ee0ff",
        },
    },
    {
        min: 4.25,
        verdict: {
            title: "KOMPENSIERT",
            line: "Your other grades carried this one like a Lerngruppe carries that one guy.",
            career: "Eternal teaching assistant",
            color: "#3ee0ff",
        },
    },
    {
        min: 4,
        verdict: {
            title: "4.0 IS A PASS",
            line: "Bestanden. Nobody will ever ask for your grade. Never tell them.",
            career: "Product manager. Nobody knows what you do",
            color: "#3ee0ff",
        },
    },
];

const NOT_PASSED: { min: number; verdict: Verdict }[] = [
    {
        min: 3.75,
        verdict: {
            title: "SO CLOSE",
            line: "3.75. The grading scale has no mercy. See you at the Repetition.",
            career: 'Influencer: "How I almost passed ETH"',
            color: "#ffb43c",
        },
    },
    {
        min: 3,
        verdict: {
            title: "MAJOR REVISIONS REQUIRED",
            line: "Reviewer 2 has entered the chat. Reviewer 2 is also Prof. Gradient.",
            career: "Repeating the year, with better Zusammenfassungen",
            color: "#ffb43c",
        },
    },
    {
        min: 2,
        verdict: {
            title: "REPETITION NEXT SEMESTER",
            line: "Your seat in the HG is reserved. Same seat, same coffee, same committee.",
            career: "Mensa cashier, front row for the Basisprüfung panic",
            color: "#ff4f6d",
        },
    },
    {
        min: 1,
        verdict: {
            title: "EXMATRIKULIERT",
            line: "myStudies has logged you out. Permanently. Your Legi still opens the Mensa.",
            career: "Professional Jass player",
            color: "#ff4f6d",
        },
    },
];

const DESTROYED: { min: number; verdict: Verdict }[] = [
    {
        min: 2.5,
        verdict: {
            title: "ACADEMICALLY DESTROYED",
            line: "Your thesis has been reassigned to a first-semester TA.",
            career: "Unemployed in a 6-person WG",
            color: "#ff4f6d",
        },
    },
    {
        min: 1,
        verdict: {
            title: "SENT BACK TO THE BASISPRÜFUNG",
            line: "Do not pass the Polyterrasse. Do not collect 180 ECTS.",
            career: "First-semester student, again (the coffee machine remembers you)",
            color: "#ff4f6d",
        },
    },
];

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
