// Tunables for level 3, "Thesis defense" (docs/GAME_DESIGN.md). A four-lane rhythm game that
// must stay playable muted, so the timing windows are a little wider than a music game's and
// the note lead is long enough to read the highway like sheet music.

import { TEXT } from "../src/misc/text";

const COPY = TEXT.thesisDefense;

export const LANE_KEYS = ["D", "F", "J", "K"] as const;
export const LANE_NAMES = COPY.lanes;
export const LANE_GLYPHS = ["∀", "∫", "χ²", "?!"] as const;
// Highlighter inks, one per lane. Yellow is reserved for golden notes and Eureka.
export const LANE_COLORS = [0x5ec8ff, 0xff7ad9, 0x8cf27a, 0xffa94d] as const;
export const LANE_CSS = ["#5ec8ff", "#ff7ad9", "#8cf27a", "#ffa94d"] as const;
export const GOLD_INK = 0xfff23a;
// What each lane's questions look like on the page: references a thesis is made of.
export const LANE_TOKENS = COPY.laneTokens;
export const ACTIVATE_KEY = " "; // Space spends a full Eureka meter

// The chart is written on a sixteenth-note grid at this tempo (chart.ts).
export const BPM = 128;
export const LEAD_IN_MS = 500; // from "DEFEND!" to the first (empty) bar
export const NOTE_LEAD_MS = 1500; // how long a note is visible before it must be hit

// Keeping the song clock on the music while it plays (Soundtrack.clockCorrection): errors
// below the deadband are jitter, bigger ones are eased in a fraction per frame so the
// highway never jumps, and anything past the snap distance (a restart) is taken at once.
export const SYNC_DEADBAND_MS = 2;
export const SYNC_GAIN = 0.1;
export const SYNC_SNAP_MS = 120;

// The player's own timing offset (latency.ts), learned from a run's hits: what the browser
// can't measure, like keyboard and screen lag or Bluetooth headphones that hide their delay.
// A run needs enough hits and a clear lean before it suggests tuning, and the offset is capped.
export const CALIBRATION_MIN_HITS = 12;
export const CALIBRATION_MIN_MS = 10;
export const CALIBRATION_MAX_MS = 250;
export const OFFSET_KEY = "eth-life:thesis-defense:offset";

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
    [10, COPY.milestones.combo10],
    [25, COPY.milestones.combo25],
    [50, COPY.milestones.combo50],
    [75, COPY.milestones.combo75],
    [100, COPY.milestones.combo100],
    [150, COPY.milestones.combo150],
];
export const PERFECT_STREAK = 25;
export const PERFECT_STREAK_TITLE = COPY.milestones.perfectStreak;

// Personal best survives page loads in this browser only (no server state for a practice
// score; the year's credit is what the shell saves).
export const BEST_KEY = "eth-life:thesis-defense:best";

// Countdown before each attempt.
export const COUNTDOWN_MS = 2400;
