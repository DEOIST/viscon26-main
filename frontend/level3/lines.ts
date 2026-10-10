// What the committee says, heavy on ETH in-jokes. Built in, like the dealer's fallback lines:
// this level has no server side, so it never waits for (or spends) an AI call.

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
            "This wouldn't survive the Basisprüfung.",
            "Did you write this in the Mensa queue?",
            "Even the Polybahn reasons faster than you.",
            "Have you tried asking the VIS Discord?",
            "Your Zusammenfassung is showing.",
            "Is this from a 2009 exam collection?",
        ],
        stray: [
            "Nobody asked that.",
            "Answering questions I didn't ask?",
            "Focus, please.",
            "Answering questions nobody asked? Very HSG.",
        ],
        streak: [
            "Who supervised this?!",
            "Hm. Not bad.",
            "I may have to re-read my notes.",
            "Fine. FINE.",
            "Is this... novel?",
            "Okay, who leaked the exam?",
            "Is this the Lerngruppe of legends?",
            "Somebody call the Rektorin.",
        ],
        meltdown: [
            "WHY IS YOUR p-VALUE 0.051?!",
            "DEFINE 'CONVERGES'!",
            "THE LEARNING RATE! THE LEARNING RATE!",
            "HAVE YOU TRIED A LARGER n?!",
            "WHO PUT TABS IN YOUR LATEX?!",
            "IT DOESN'T EVEN RUN ON EULER!",
            "THE MENSA IS CLOSED AND SO IS MY PATIENCE!",
        ],
        final: [
            "One last question...",
            "Convince all three of us.",
            "Defend. Your. Thesis.",
            "Last question, then Apéro.",
        ],
        eureka: [
            "Wait, that actually makes sense.",
            "Eureka?! In MY defense?",
            "Did somebody ring the tram bell?",
        ],
        failed: [
            "We'll need to talk to your supervisor.",
            "Have you considered a career in consulting?",
            "Have you considered HSG?",
            "There's always the Repetition in August.",
        ],
        passed: [
            `Congratulations, Dr. ${name}.`,
            "The committee will now deliberate. Over beer.",
            "Apéro on the Polyterrasse. You earned it.",
        ],
    };
}
