// The defense, written as a deterministic chart. Every run is the same 31 bars, so practice
// pays off and scores are comparable. Each section opens with an empty bar: the phase banner
// and the committee's reaction get the stage before the next notes arrive.
//
// Each bar is a row of space-separated steps; a bar with 4, 8 or 16 steps is played in
// quarter, eighth or sixteenth notes. A step is "." (rest) or the lanes to press together
// ("D", "FK", "DFJK"); a leading "*" makes the whole step golden.

import { BPM, LANE_KEYS, LEAD_IN_MS } from "./config";

export type Phase = "opening" | "cross" | "meltdown" | "final";

export interface Note {
    id: number;
    time: number; // ms after the start of the attempt, when the note reaches the hit line
    lane: number; // 0–3, LANE_KEYS order
    gold: boolean;
}

export interface Section {
    phase: Phase;
    title: string;
    subtitle: string;
    bars: string[];
}

export interface PhaseMark {
    time: number;
    section: Section;
}

export interface Chart {
    notes: Note[];
    phases: PhaseMark[];
    end: number; // ms when the last bar is over
}

export const BAR_MS = (4 * 60_000) / BPM;

const STEPS_PER_BAR = [1, 4, 8, 16];

export function parseStep(step: string): { lanes: number[]; gold: boolean } {
    if (step === ".") return { lanes: [], gold: false };
    const gold = step.startsWith("*");
    const keys = gold ? step.slice(1) : step;
    if (keys.length === 0) throw new Error(`Empty step "${step}"`);
    const lanes = [...keys].map((key) => {
        const lane = (LANE_KEYS as readonly string[]).indexOf(key);
        if (lane < 0) throw new Error(`Unknown lane "${key}" in "${step}"`);
        return lane;
    });
    if (new Set(lanes).size !== lanes.length)
        throw new Error(`Repeated lane in "${step}"`);
    return { lanes: lanes.sort((a, b) => a - b), gold };
}

export function buildChart(sections: Section[], start = LEAD_IN_MS): Chart {
    const notes: Note[] = [];
    const phases: PhaseMark[] = [];
    let bar = 0;
    for (const section of sections) {
        phases.push({ time: start + bar * BAR_MS, section });
        for (const row of section.bars) {
            const steps = row.trim().split(/\s+/);
            if (!STEPS_PER_BAR.includes(steps.length))
                throw new Error(`Bar "${row}" has ${steps.length} steps`);
            const stepMs = BAR_MS / steps.length;
            steps.forEach((step, i) => {
                const { lanes, gold } = parseStep(step);
                const time = Math.round(start + bar * BAR_MS + i * stepMs);
                for (const lane of lanes)
                    notes.push({ id: notes.length, time, lane, gold });
            });
            bar += 1;
        }
    }
    return { notes, phases, end: start + bar * BAR_MS };
}

// --- The defense ------------------------------------------------------------

export const DEFENSE: Section[] = [
    {
        phase: "opening",
        title: "OPENING QUESTIONS",
        subtitle: "Prof. Lemma clears her throat.",
        bars: [
            ".",
            "D . F .",
            "J . K .",
            "D F J K",
            "K J F D",
            "D . D F . . J K",
            "*J . K . J . F .",
            "*D . F . DJ . . .",
        ],
    },
    {
        phase: "cross",
        title: "CROSS-EXAMINATION",
        subtitle: "Prof. Bootstrap wants error bars.",
        bars: [
            ".",
            "D J F K D J F K",
            "DJ . FK . DJ . FK .",
            "D F J K J F D .",
            "*FJ . D . K . FJ .",
            "D . F J . K J F",
            "DK . FJ . DK . *FJ .",
            "D F J K . . . . K J F D . . . .",
            "DJ . FK . D F J K",
        ],
    },
    {
        phase: "meltdown",
        title: "PROFESSOR MELTDOWN",
        subtitle: "Prof. Gradient has diverged.",
        bars: [
            ".",
            "D F D F . . J K J K . . DJ . FK .",
            "D F J K D F J K . . . . *DK . . .",
            "K J K J . . F D F D . . FJ . DK .",
            "D F J K J F D F J K J F . . . .",
            "DJ . FK . DJ . FK . D F J K . . *FK .",
            "K . J . F . D . *DJ . . . FK . . .",
        ],
    },
    {
        phase: "final",
        title: "FINAL DEFENSE",
        subtitle: "The whole committee leans forward.",
        bars: [
            ".",
            "DJ . FK . D F J K . . DK . FJ . . .",
            "D F J K D F J K D F J K D F J K",
            "*DJ . FK . DJ . FK . DF . JK . DF . JK .",
            "K J F D . . . . D F J K . . . .",
            "DK . . . FJ . . . DK . FJ . DK . FJ .",
            "*DFJK . . . . . . .",
        ],
    },
];

export const DEFENSE_CHART = buildChart(DEFENSE);
