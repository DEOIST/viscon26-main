// The defense's rules, free of Phaser: judging key presses against the chart, combo and
// multiplier, thesis confidence, the Eureka meter and the phases. The scene feeds it key
// presses with their own timestamps and calls update() every frame; everything it draws comes
// from `state` and the events returned here.

import type { Chart, Note, Section } from "./chart";
import {
    ACCURACY_WEIGHT,
    CONFIDENCE_GAIN,
    CONFIDENCE_MAX,
    CONFIDENCE_MISS,
    CONFIDENCE_START,
    CONFIDENCE_STRAY,
    EUREKA_DURATION_MS,
    EUREKA_MISS_FACTOR,
    EUREKA_MULTIPLIER,
    EUREKA_PER_GOLD,
    GOLD_BONUS,
    MAX_MULTIPLIER,
    MILESTONES,
    MISS_GRACE_MS,
    MULTIPLIER_STEP,
    PERFECT_STREAK,
    PERFECT_STREAK_TITLE,
    POINTS,
    WINDOWS,
} from "./config";

export type Judgment = "perfect" | "great" | "good" | "miss";
export type Hit = Exclude<Judgment, "miss">;
export type Status = "playing" | "failed" | "complete";

export type DefenseEvent =
    | {
          type: "hit";
          note: Note;
          judgment: Hit;
          delta: number; // ms, negative = early
          points: number;
      }
    | { type: "miss"; note: Note }
    | { type: "stray"; lane: number }
    | { type: "milestone"; title: string }
    | { type: "phase"; section: Section; index: number }
    | { type: "eureka-ready" }
    | { type: "eureka-start" }
    | { type: "eureka-end" }
    | { type: "failed" }
    | { type: "complete" };

export interface DefenseState {
    status: Status;
    score: number;
    combo: number;
    maxCombo: number;
    perfectStreak: number;
    multiplier: number;
    confidence: number; // 0–100
    eureka: number; // 0–100; while active, what is left of it
    eurekaActive: boolean;
    phaseIndex: number; // -1 before the first phase
    counts: Record<Judgment | "stray", number>;
}

export function judge(delta: number): Judgment {
    const distance = Math.abs(delta);
    if (distance <= WINDOWS.perfect) return "perfect";
    if (distance <= WINDOWS.great) return "great";
    if (distance <= WINDOWS.good) return "good";
    return "miss";
}

export class DefenseEngine {
    readonly chart: Chart;
    readonly state: DefenseState = {
        status: "playing",
        score: 0,
        combo: 0,
        maxCombo: 0,
        perfectStreak: 0,
        multiplier: 1,
        confidence: CONFIDENCE_START,
        eureka: 0,
        eurekaActive: false,
        phaseIndex: -1,
        counts: { perfect: 0, great: 0, good: 0, miss: 0, stray: 0 },
    };
    private readonly lanes: Note[][] = [[], [], [], []];
    private readonly heads = [0, 0, 0, 0]; // first unjudged note per lane
    private eurekaEnds = 0;

    constructor(chart: Chart) {
        this.chart = chart;
        for (const note of chart.notes) this.lanes[note.lane].push(note);
    }

    // Unjudged notes due between `from` and `to`, for drawing.
    *upcoming(from: number, to: number): Generator<Note> {
        for (let lane = 0; lane < 4; lane++) {
            const notes = this.lanes[lane];
            for (let i = this.heads[lane]; i < notes.length; i++) {
                if (notes[i].time > to) break;
                if (notes[i].time >= from) yield notes[i];
            }
        }
    }

    press(lane: number, time: number): DefenseEvent[] {
        if (this.state.status !== "playing") return [];
        const events: DefenseEvent[] = [];
        const notes = this.lanes[lane];
        // Notes whose window closed before this press are misses, whatever the frame said.
        while (
            this.heads[lane] < notes.length &&
            time - notes[this.heads[lane]].time > WINDOWS.good
        ) {
            this.miss(notes[this.heads[lane]++], time, events);
            if (this.state.status !== "playing") return events;
        }
        const note = notes[this.heads[lane]];
        const judgment = note ? judge(time - note.time) : "miss";
        if (!note || judgment === "miss") {
            this.state.counts.stray += 1;
            this.breakCombo();
            this.loseConfidence(CONFIDENCE_STRAY, events);
            events.push({ type: "stray", lane });
            return events;
        }
        this.heads[lane] += 1;
        this.hit(note, judgment, time - note.time, events);
        return events;
    }

    activate(time: number): DefenseEvent[] {
        const state = this.state;
        if (state.status !== "playing" || state.eurekaActive) return [];
        if (state.eureka < 100) return [];
        state.eurekaActive = true;
        this.eurekaEnds = time + EUREKA_DURATION_MS;
        this.updateMultiplier();
        return [{ type: "eureka-start" }];
    }

    update(time: number): DefenseEvent[] {
        const state = this.state;
        if (state.status !== "playing") return [];
        const events: DefenseEvent[] = [];
        const next = this.chart.phases[state.phaseIndex + 1];
        if (next && time >= next.time) {
            state.phaseIndex += 1;
            events.push({
                type: "phase",
                section: next.section,
                index: state.phaseIndex,
            });
        }
        if (state.eurekaActive) {
            const left = this.eurekaEnds - time;
            state.eureka = Math.max(0, (left / EUREKA_DURATION_MS) * 100);
            if (left <= 0) {
                state.eurekaActive = false;
                state.eureka = 0;
                this.updateMultiplier();
                events.push({ type: "eureka-end" });
            }
        }
        // Expired notes leave in time order across lanes, so confidence runs out at the right one.
        const expired: Note[] = [];
        for (let lane = 0; lane < 4; lane++) {
            const notes = this.lanes[lane];
            while (
                this.heads[lane] < notes.length &&
                time - notes[this.heads[lane]].time >
                    WINDOWS.good + MISS_GRACE_MS
            )
                expired.push(notes[this.heads[lane]++]);
        }
        expired.sort((a, b) => a.time - b.time || a.lane - b.lane);
        for (const note of expired) {
            this.miss(note, time, events);
            if (state.status !== "playing") return events;
        }
        if (time >= this.chart.end) {
            state.status = "complete";
            events.push({ type: "complete" });
        }
        return events;
    }

    // Weighted accuracy of the notes judged so far, 0–100.
    accuracy(): number {
        const judged = this.judged();
        return judged === 0
            ? 100
            : Math.round((this.weighted() / judged) * 1000) / 10;
    }

    // The contract's 0–100 score: unplayed notes of a failed defense count as misses.
    contractScore(): number {
        const total = this.chart.notes.length;
        return total === 0 ? 0 : Math.round((this.weighted() / total) * 100);
    }

    private judged(): number {
        const { perfect, great, good, miss } = this.state.counts;
        return perfect + great + good + miss;
    }

    private weighted(): number {
        const { counts } = this.state;
        return (
            counts.perfect * ACCURACY_WEIGHT.perfect +
            counts.great * ACCURACY_WEIGHT.great +
            counts.good * ACCURACY_WEIGHT.good
        );
    }

    private hit(note: Note, judgment: Hit, delta: number, out: DefenseEvent[]) {
        const state = this.state;
        state.counts[judgment] += 1;
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.perfectStreak =
            judgment === "perfect" ? state.perfectStreak + 1 : 0;
        this.updateMultiplier();
        const points =
            (POINTS[judgment] + (note.gold ? GOLD_BONUS : 0)) *
            state.multiplier;
        state.score += points;
        state.confidence = Math.min(
            CONFIDENCE_MAX,
            state.confidence + CONFIDENCE_GAIN[judgment],
        );
        out.push({ type: "hit", note, judgment, delta, points });
        for (const [combo, title] of MILESTONES)
            if (state.combo === combo) out.push({ type: "milestone", title });
        if (state.perfectStreak === PERFECT_STREAK)
            out.push({ type: "milestone", title: PERFECT_STREAK_TITLE });
        if (note.gold && !state.eurekaActive && state.eureka < 100) {
            state.eureka = Math.min(100, state.eureka + EUREKA_PER_GOLD);
            if (state.eureka === 100) out.push({ type: "eureka-ready" });
        }
    }

    private miss(note: Note, _time: number, out: DefenseEvent[]) {
        this.state.counts.miss += 1;
        this.breakCombo();
        out.push({ type: "miss", note });
        const factor = this.state.eurekaActive ? EUREKA_MISS_FACTOR : 1;
        this.loseConfidence(CONFIDENCE_MISS * factor, out);
    }

    private breakCombo() {
        this.state.combo = 0;
        this.state.perfectStreak = 0;
        this.updateMultiplier();
    }

    private loseConfidence(amount: number, out: DefenseEvent[]) {
        const state = this.state;
        state.confidence = Math.max(0, state.confidence - amount);
        if (state.confidence > 0) return;
        state.status = "failed";
        state.eurekaActive = false;
        out.push({ type: "failed" });
    }

    private updateMultiplier() {
        const state = this.state;
        const base = Math.min(
            MAX_MULTIPLIER,
            1 + Math.floor(state.combo / MULTIPLIER_STEP),
        );
        state.multiplier = base * (state.eurekaActive ? EUREKA_MULTIPLIER : 1);
    }
}
