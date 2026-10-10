// Tunables for level 3, "Thesis defense" (docs/GAME_DESIGN.md). A four-lane rhythm game with
// no audio, so the timing windows are a little wider than a music game's and the note lead is
// long enough to read the highway like sheet music.

export const LANE_KEYS = ["D", "F", "J", "K"] as const;
export const LANE_NAMES = [
    "Theory",
    "Proofs",
    "Experiments",
    "Critique",
] as const;
export const LANE_GLYPHS = ["∀", "∫", "χ²", "?!"] as const;
export const LANE_COLORS = [0x3ee0ff, 0xff4fd8, 0x9dff4a, 0xffb43c] as const;
export const LANE_CSS = ["#3ee0ff", "#ff4fd8", "#9dff4a", "#ffb43c"] as const;
export const ACTIVATE_KEY = " "; // Space spends a full Eureka meter

// The chart is written on a sixteenth-note grid at this tempo (chart.ts).
export const BPM = 128;
export const LEAD_IN_MS = 500; // from "DEFEND!" to the first (empty) bar
export const NOTE_LEAD_MS = 1500; // how long a note is visible before it must be hit

// Timing windows, +- milliseconds around a note.
export const WINDOWS = { perfect: 45, great: 90, good: 135 } as const;
// A note is only written off this long after its late window, so a key event that arrives
// just after the frame that would have missed it is still judged by its own timestamp.
export const MISS_GRACE_MS = 50;

// Points per judgment before the multiplier; golden notes add a flat bonus on top.
export const POINTS = { perfect: 100, great: 70, good: 40 } as const;
export const GOLD_BONUS = 50;
// Contract score weights: the 0–100 result is the weighted share of all notes.
export const ACCURACY_WEIGHT = { perfect: 1, great: 0.8, good: 0.5, miss: 0 };

// Multiplier: +1 every MULTIPLIER_STEP combo, capped; Eureka doubles it.
export const MULTIPLIER_STEP = 10;
export const MAX_MULTIPLIER = 4;
export const EUREKA_MULTIPLIER = 2;

// Thesis confidence (0–100). Beginners finish phase 1 full, so the meltdown is survivable
// with roughly two thirds of its notes; a button masher is not.
export const CONFIDENCE_START = 70;
export const CONFIDENCE_MAX = 100;
export const CONFIDENCE_GAIN = { perfect: 2, great: 1.5, good: 1 } as const;
export const CONFIDENCE_MISS = 4;
export const CONFIDENCE_STRAY = 2; // a press with no note to answer
export const EUREKA_MISS_FACTOR = 0.5; // misses hurt half as much during Eureka

// Eureka: golden notes fill it, Space spends it.
export const EUREKA_PER_GOLD = 25; // four golden notes fill the meter
export const EUREKA_DURATION_MS = 8000;

// Combo milestones (cumulative combo) and the flawless streak callout.
export const MILESTONES: readonly [number, string][] = [
    [10, "PROMISING RESEARCH"],
    [25, "PEER REVIEW SURVIVED"],
    [50, "ACADEMIC WEAPON"],
    [75, "CITED BY EVERYONE"],
    [100, "TENURE TRACK UNLOCKED"],
    [150, "FIELDS MEDAL SPEEDRUN"],
];
export const PERFECT_STREAK = 25;
export const PERFECT_STREAK_TITLE = "NOBEL PRIZE INCOMING";

// Personal best survives page loads in this browser only (no server state for a practice
// score; the year's credit is what the shell saves).
export const BEST_KEY = "eth-life:thesis-defense:best";

// Countdown before each attempt.
export const COUNTDOWN_MS = 2400;
