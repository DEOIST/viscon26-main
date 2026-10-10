// What the committee says. Built in, like the dealer's fallback lines: this level has no
// server side, so it never waits for (or spends) an AI call.

export type CommitteeEvent =
    | "intro"
    | "miss"
    | "stray"
    | "streak"
    | "meltdown"
    | "final"
    | "eureka"
    | "failed"
    | "passed";

export const PROFESSORS = [
    { name: "PROF. LEMMA", field: "THEORY" },
    { name: "PROF. GRADIENT", field: "CHAIR · ML" },
    { name: "PROF. BOOTSTRAP", field: "EXPERIMENTS" },
] as const;

export function committeeLines(name: string): Record<CommitteeEvent, string[]> {
    return {
        intro: [
            `${name}, you may begin.`,
            "Let's start with something easy.",
            "Please, define 'thesis'.",
        ],
        miss: [
            "Is that your final answer?",
            "Interesting. Wrong, but interesting.",
            "Did you read your own thesis?",
            "Page 42 disagrees with you.",
            "My PhD students would weep.",
            "Hmm. Citation needed.",
            "That's not even wrong.",
        ],
        stray: [
            "Nobody asked that.",
            "Answering questions I didn't ask?",
            "Focus, please.",
        ],
        streak: [
            "Who supervised this?!",
            "Hm. Not bad.",
            "I may have to re-read my notes.",
            "Fine. FINE.",
            "Is this... novel?",
        ],
        meltdown: [
            "WHY IS YOUR p-VALUE 0.051?!",
            "DEFINE 'CONVERGES'!",
            "THE LEARNING RATE! THE LEARNING RATE!",
            "HAVE YOU TRIED A LARGER n?!",
        ],
        final: [
            "One last question...",
            "Convince all three of us.",
            "Defend. Your. Thesis.",
        ],
        eureka: ["Wait, that actually makes sense.", "Eureka?! In MY defense?"],
        failed: [
            "We'll need to talk to your supervisor.",
            "Have you considered a career in consulting?",
        ],
        passed: [
            `Congratulations, Dr. ${name}.`,
            "The committee will now deliberate. Over beer.",
        ],
    };
}
