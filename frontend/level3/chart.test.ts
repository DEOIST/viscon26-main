import { describe, expect, it } from "vitest";
import {
    BAR_MS,
    BEAT_MS,
    BEAT_ORIGIN_MS,
    DEFENSE_CHART,
    buildTrackChart,
} from "./chart";
import { TRACK_CHART } from "./trackChart";

describe("buildTrackChart", () => {
    it("sorts notes, numbers them and names the phases", () => {
        const chart = buildTrackChart({
            beatMs: 500,
            firstBeatMs: 0,
            durationMs: 4000,
            end: 4000,
            phases: [{ phase: "opening", time: 0 }],
            notes: [
                [1000, 3, false],
                [500, 0, true],
                [1000, 1, false],
            ],
        });
        expect(chart.notes).toEqual([
            { id: 0, time: 500, lane: 0, gold: true },
            { id: 1, time: 1000, lane: 1, gold: false },
            { id: 2, time: 1000, lane: 3, gold: false },
        ]);
        expect(chart.phases[0].section.title).toBe("OPENING QUESTIONS");
    });

    it("rejects a note outside the four lanes", () => {
        expect(() =>
            buildTrackChart({ ...TRACK_CHART, notes: [[100, 4, false]] }),
        ).toThrow(/lane 4/);
    });
});

describe("the defense chart", () => {
    const notes = DEFENSE_CHART.notes;
    const phases = DEFENSE_CHART.phases;

    it("lasts about a minute with the four phases in story order", () => {
        expect(DEFENSE_CHART.end / 1000).toBeGreaterThanOrEqual(45);
        expect(DEFENSE_CHART.end).toBeLessThanOrEqual(TRACK_CHART.durationMs);
        expect(phases.map((mark) => mark.section.phase)).toEqual([
            "opening",
            "cross",
            "meltdown",
            "final",
        ]);
        expect(notes[notes.length - 1].time).toBeLessThan(DEFENSE_CHART.end);
    });

    // The point of a music track: every note lands on its sixteenth-note grid.
    it("puts every note on the track's sixteenth grid", () => {
        const sixteenth = BEAT_MS / 4;
        for (const note of notes) {
            const steps = (note.time - BEAT_ORIGIN_MS) / sixteenth;
            expect(
                Math.abs(steps - Math.round(steps)) * sixteenth,
            ).toBeLessThan(2);
        }
    });

    it("is sorted by time with unique ids", () => {
        for (let i = 1; i < notes.length; i++)
            expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
        expect(new Set(notes.map((note) => note.id)).size).toBe(notes.length);
    });

    // Two notes in one lane closer than an eighth would make the judgment ambiguous.
    it("never repeats a lane faster than an eighth note", () => {
        const last = [-Infinity, -Infinity, -Infinity, -Infinity];
        const tooClose: string[] = [];
        for (const note of notes) {
            if (note.time - last[note.lane] < BAR_MS / 8 - 3)
                tooClose.push(`lane ${note.lane} at ${note.time}`);
            last[note.lane] = note.time;
        }
        expect(tooClose).toEqual([]);
    });

    // Each phase opens with an empty stretch for its heading and the committee's line.
    it("leaves the start of every later phase empty", () => {
        for (const mark of phases.slice(1))
            expect(
                notes.some(
                    (note) =>
                        note.time >= mark.time &&
                        note.time < mark.time + BAR_MS * 0.9,
                ),
            ).toBe(false);
    });

    const densities = phases.map((mark, i) => {
        const to = phases[i + 1]?.time ?? DEFENSE_CHART.end;
        const count = notes.filter(
            (note) => note.time >= mark.time && note.time < to,
        ).length;
        return count / ((to - mark.time) / 1000);
    });

    it("ramps up after the opening, peaking in the meltdown", () => {
        expect(densities[1]).toBeGreaterThan(densities[0]);
        expect(densities[2]).toBeGreaterThanOrEqual(densities[1]);
        expect(densities[3]).toBeLessThanOrEqual(densities[2] + 0.01);
    });

    it("never asks for more than 4 notes per second in any phase", () => {
        for (const density of densities) expect(density).toBeLessThan(4);
    });

    it("keeps sixteenth-note runs to short bursts of at most four steps", () => {
        const steps = [...new Set(notes.map((note) => note.time))];
        let run = 1;
        let longest = 1;
        for (let i = 1; i < steps.length; i++) {
            run = steps[i] - steps[i - 1] < BAR_MS / 8 - 3 ? run + 1 : 1;
            longest = Math.max(longest, run);
        }
        expect(longest).toBeLessThanOrEqual(4);
    });

    it("has golden notes to fill Eureka twice and ends on a four-key chord", () => {
        const goldSteps = new Set(
            notes.filter((note) => note.gold).map((note) => note.time),
        );
        expect(goldSteps.size).toBeGreaterThanOrEqual(8);
        const finalTime = notes[notes.length - 1].time;
        expect(
            notes.filter((note) => note.time === finalTime).map((n) => n.lane),
        ).toEqual([0, 1, 2, 3]);
    });
});
