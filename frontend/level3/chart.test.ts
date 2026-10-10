import { describe, expect, it } from "vitest";
import { BAR_MS, DEFENSE, DEFENSE_CHART, buildChart, parseStep } from "./chart";
import { LEAD_IN_MS } from "./config";

describe("parseStep", () => {
    it("reads rests, single lanes, chords and golden steps", () => {
        expect(parseStep(".")).toEqual({ lanes: [], gold: false });
        expect(parseStep("J")).toEqual({ lanes: [2], gold: false });
        expect(parseStep("KD")).toEqual({ lanes: [0, 3], gold: false });
        expect(parseStep("*DFJK")).toEqual({ lanes: [0, 1, 2, 3], gold: true });
    });

    it("rejects typos instead of silently dropping notes", () => {
        expect(() => parseStep("X")).toThrow(/Unknown lane/);
        expect(() => parseStep("DD")).toThrow(/Repeated lane/);
        expect(() => parseStep("*")).toThrow(/Empty step/);
    });
});

describe("buildChart", () => {
    it("places steps on the bar's grid after the lead-in", () => {
        const chart = buildChart(
            [
                {
                    phase: "opening",
                    title: "",
                    subtitle: "",
                    bars: ["D . F .", "D F J K D F J K"],
                },
            ],
            1000,
        );
        expect(chart.notes.map((note) => [note.time, note.lane])).toEqual([
            [1000, 0],
            [Math.round(1000 + BAR_MS / 2), 1],
            ...[0, 1, 2, 3, 0, 1, 2, 3].map((lane, i) => [
                Math.round(1000 + BAR_MS + (i * BAR_MS) / 8),
                lane,
            ]),
        ]);
        expect(chart.end).toBe(1000 + 2 * BAR_MS);
    });

    it("rejects bars that are not on a 1/4/8/16 grid", () => {
        expect(() =>
            buildChart([
                { phase: "opening", title: "", subtitle: "", bars: ["D F J"] },
            ]),
        ).toThrow(/3 steps/);
    });
});

describe("the defense chart", () => {
    const notes = DEFENSE_CHART.notes;

    it("runs 45–60 seconds with the four phases in story order", () => {
        expect(DEFENSE_CHART.end / 1000).toBeGreaterThanOrEqual(45);
        expect(DEFENSE_CHART.end / 1000).toBeLessThanOrEqual(61);
        expect(DEFENSE_CHART.phases.map((mark) => mark.section.phase)).toEqual([
            "opening",
            "cross",
            "meltdown",
            "final",
        ]);
        expect(DEFENSE_CHART.phases[0].time).toBe(LEAD_IN_MS);
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
            if (note.time - last[note.lane] < BAR_MS / 8 - 1)
                tooClose.push(`lane ${note.lane} at ${note.time}`);
            last[note.lane] = note.time;
        }
        expect(tooClose).toEqual([]);
    });

    const densities = DEFENSE.map((_, i) => {
        const from = DEFENSE_CHART.phases[i].time;
        const to = DEFENSE_CHART.phases[i + 1]?.time ?? DEFENSE_CHART.end;
        const count = notes.filter(
            (note) => note.time >= from && note.time < to,
        ).length;
        return count / ((to - from) / 1000);
    });

    it("ramps up after the opening, peaking in the meltdown", () => {
        expect(densities[1]).toBeGreaterThan(densities[0]);
        expect(densities[2]).toBeGreaterThanOrEqual(densities[1]);
        expect(densities[3]).toBeLessThanOrEqual(densities[2] + 0.01);
    });

    // Players found the old ending too fast: no phase may outrun a learnable pace.
    it("never asks for more than 4 notes per second in any phase", () => {
        for (const density of densities) expect(density).toBeLessThan(4);
    });

    it("keeps sixteenth-note runs to short bursts of at most four steps", () => {
        const steps = [...new Set(notes.map((note) => note.time))];
        let run = 1;
        let longest = 1;
        for (let i = 1; i < steps.length; i++) {
            run = steps[i] - steps[i - 1] < BAR_MS / 8 - 1 ? run + 1 : 1;
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
