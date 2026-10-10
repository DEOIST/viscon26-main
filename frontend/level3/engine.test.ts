import { describe, expect, it } from "vitest";
import { DEFENSE_CHART } from "./chart";
import type { Chart, Note } from "./chart";
import {
    CONFIDENCE_MISS,
    CONFIDENCE_START,
    CONFIDENCE_STRAY,
    EUREKA_DURATION_MS,
    MISS_GRACE_MS,
    WINDOWS,
} from "./config";
import { DefenseEngine, judge } from "./engine";
import type { DefenseEvent } from "./engine";

function chartOf(notes: [number, number, boolean?][], end = 10_000): Chart {
    return {
        notes: notes.map(([time, lane, gold], id) => ({
            id,
            time,
            lane,
            gold: gold ?? false,
        })),
        phases: [],
        end,
    };
}

const types = (events: DefenseEvent[]) => events.map((event) => event.type);

describe("judge", () => {
    it("grades the distance to the note, early or late alike", () => {
        expect(judge(0)).toBe("perfect");
        expect(judge(-WINDOWS.perfect)).toBe("perfect");
        expect(judge(WINDOWS.perfect + 1)).toBe("great");
        expect(judge(-WINDOWS.great)).toBe("great");
        expect(judge(WINDOWS.great + 1)).toBe("good");
        expect(judge(-WINDOWS.good)).toBe("good");
        expect(judge(WINDOWS.good + 1)).toBe("miss");
    });
});

describe("DefenseEngine presses", () => {
    it("hits the note in the pressed lane and reports timing", () => {
        const engine = new DefenseEngine(chartOf([[1000, 1]]));
        const [hit] = engine.press(1, 1060);
        expect(hit).toMatchObject({
            type: "hit",
            judgment: "great",
            delta: 60,
        });
        expect(engine.state.combo).toBe(1);
        expect(engine.state.counts.great).toBe(1);
        expect(engine.state.score).toBe(70);
    });

    it("treats a press in an empty lane as a stray that breaks the combo", () => {
        const engine = new DefenseEngine(
            chartOf([
                [1000, 0],
                [1500, 0],
            ]),
        );
        engine.press(0, 1000);
        expect(engine.state.combo).toBe(1);
        expect(types(engine.press(2, 1100))).toEqual(["stray"]);
        expect(engine.state.combo).toBe(0);
        expect(engine.state.confidence).toBe(
            CONFIDENCE_START + 2 - CONFIDENCE_STRAY,
        );
    });

    it("does not let one press answer two notes in a lane", () => {
        const engine = new DefenseEngine(
            chartOf([
                [1000, 0],
                [1234, 0],
            ]),
        );
        expect(engine.press(0, 1100)[0]).toMatchObject({
            type: "hit",
            note: expect.objectContaining({ id: 0 }),
        });
        expect(engine.press(0, 1240)[0]).toMatchObject({
            type: "hit",
            judgment: "perfect",
            note: expect.objectContaining({ id: 1 }),
        });
    });

    it("misses a note whose window passed before the press, then answers the next", () => {
        const engine = new DefenseEngine(
            chartOf([
                [1000, 0],
                [1300, 0],
            ]),
        );
        const events = engine.press(0, 1290);
        expect(types(events)).toEqual(["miss", "hit"]);
        expect(engine.state.counts.miss).toBe(1);
        expect(engine.state.combo).toBe(1);
    });

    it("judges chord notes independently", () => {
        const engine = new DefenseEngine(
            chartOf([
                [1000, 0],
                [1000, 3],
            ]),
        );
        engine.press(0, 1000);
        engine.press(3, 1060);
        expect(engine.state.counts).toMatchObject({ perfect: 1, great: 1 });
        expect(engine.state.combo).toBe(2);
    });

    it("ignores input after the defense is over", () => {
        const engine = new DefenseEngine(chartOf([[1000, 0]], 1500));
        engine.update(2000);
        expect(engine.state.status).toBe("complete");
        expect(engine.press(0, 2000)).toEqual([]);
    });
});

describe("DefenseEngine update", () => {
    it("misses notes only after the late window plus grace", () => {
        const engine = new DefenseEngine(chartOf([[1000, 2]]));
        expect(engine.update(1000 + WINDOWS.good + MISS_GRACE_MS)).toEqual([]);
        const events = engine.update(1001 + WINDOWS.good + MISS_GRACE_MS);
        expect(types(events)).toEqual(["miss"]);
        expect(engine.state.confidence).toBe(
            CONFIDENCE_START - CONFIDENCE_MISS,
        );
    });

    it("announces each phase once, in order", () => {
        const engine = new DefenseEngine(DEFENSE_CHART);
        const phases = DEFENSE_CHART.phases;
        const first = engine.update(phases[0].time);
        expect(first.filter((e) => e.type === "phase")).toHaveLength(1);
        expect(engine.update(phases[0].time + 1)).not.toContainEqual(
            expect.objectContaining({ type: "phase" }),
        );
        expect(engine.state.phaseIndex).toBe(0);
    });

    it("fails the defense when confidence runs out", () => {
        const notes: [number, number][] = Array.from({ length: 40 }, (_, i) => [
            1000 + i * 300,
            i % 4,
        ]);
        const engine = new DefenseEngine(chartOf(notes, 20_000));
        const events = engine.update(20_000);
        expect(types(events)).toContain("failed");
        expect(engine.state.status).toBe("failed");
        expect(engine.state.confidence).toBe(0);
    });

    it("completes after the chart ends", () => {
        const engine = new DefenseEngine(chartOf([[1000, 0]], 3000));
        engine.press(0, 1000);
        expect(types(engine.update(2999))).toEqual([]);
        expect(types(engine.update(3000))).toEqual(["complete"]);
        expect(types(engine.update(3100))).toEqual([]);
    });
});

describe("combo, multiplier and milestones", () => {
    const run = (count: number) =>
        Array.from(
            { length: count },
            (_, i) => [1000 + i * 250, i % 4] as [number, number],
        );

    it("raises the multiplier every 10 combo up to 4x", () => {
        const engine = new DefenseEngine(chartOf(run(45), 60_000));
        const seen: number[] = [];
        for (const note of engine.chart.notes) {
            engine.press(note.lane, note.time);
            seen.push(engine.state.multiplier);
        }
        expect(seen[8]).toBe(1);
        expect(seen[9]).toBe(2);
        expect(seen[19]).toBe(3);
        expect(seen[29]).toBe(4);
        expect(seen[44]).toBe(4);
        expect(engine.state.maxCombo).toBe(45);
    });

    it("calls out combo milestones and the flawless streak", () => {
        const engine = new DefenseEngine(chartOf(run(26), 60_000));
        const events: DefenseEvent[] = [];
        for (const note of engine.chart.notes)
            events.push(...engine.press(note.lane, note.time));
        const titles = events.flatMap((event) =>
            event.type === "milestone" ? [event.title] : [],
        );
        expect(titles).toEqual([
            "PROMISING RESEARCH",
            "PEER REVIEW SURVIVED",
            "NOBEL PRIZE INCOMING",
        ]);
    });
});

describe("Eureka", () => {
    const golden = (count: number): [number, number, boolean][] =>
        Array.from({ length: count }, (_, i) => [1000 + i * 300, i % 4, true]);

    it("fills from golden notes and refuses to start early", () => {
        const engine = new DefenseEngine(chartOf(golden(4), 60_000));
        const notes: Note[] = engine.chart.notes;
        engine.press(notes[0].lane, notes[0].time);
        expect(engine.state.eureka).toBe(25);
        expect(engine.activate(1500)).toEqual([]);
        const events: DefenseEvent[] = [];
        for (const note of notes.slice(1))
            events.push(...engine.press(note.lane, note.time));
        expect(types(events)).toContain("eureka-ready");
        expect(engine.state.eureka).toBe(100);
    });

    it("doubles the multiplier, softens misses, then wears off", () => {
        const notes = [...golden(4), [5000, 0, false], [5300, 1, false]] as [
            number,
            number,
            boolean,
        ][];
        const engine = new DefenseEngine(chartOf(notes, 60_000));
        for (const note of engine.chart.notes.slice(0, 4))
            engine.press(note.lane, note.time);
        expect(types(engine.activate(4000))).toEqual(["eureka-start"]);
        expect(engine.state.eurekaActive).toBe(true);
        const before = engine.state.score;
        engine.press(0, 5000);
        expect(engine.state.score - before).toBe(100 * 1 * 2);
        const confidence = engine.state.confidence;
        engine.update(5300 + WINDOWS.good + MISS_GRACE_MS + 1);
        expect(confidence - engine.state.confidence).toBe(CONFIDENCE_MISS / 2);
        expect(types(engine.update(4000 + EUREKA_DURATION_MS))).toEqual([
            "eureka-end",
        ]);
        expect(engine.state.eurekaActive).toBe(false);
        expect(engine.state.eureka).toBe(0);
    });
});

describe("balance on the real chart", () => {
    // A deterministic stand-in for a player: hits `skill` of the notes with a jittered offset.
    function play(skill: number, seed = 7) {
        let x = seed;
        const random = () => {
            x = (x * 1103515245 + 12345) % 2147483648;
            return x / 2147483648;
        };
        const engine = new DefenseEngine(DEFENSE_CHART);
        for (const note of DEFENSE_CHART.notes) {
            engine.update(note.time - 200);
            if (engine.state.status !== "playing") break;
            if (random() < skill)
                engine.press(note.lane, note.time + (random() - 0.5) * 120);
        }
        engine.update(DEFENSE_CHART.end);
        return engine;
    }

    it("lets a decent beginner survive and stops a struggling one", () => {
        expect(play(0.75).state.status).toBe("complete");
        expect(play(0.35).state.status).toBe("failed");
    });

    it("gives a flawless run the full contract score", () => {
        const engine = new DefenseEngine(DEFENSE_CHART);
        for (const note of DEFENSE_CHART.notes)
            engine.press(note.lane, note.time);
        engine.update(DEFENSE_CHART.end);
        expect(engine.state.status).toBe("complete");
        expect(engine.accuracy()).toBe(100);
        expect(engine.contractScore()).toBe(100);
    });

    it("counts unplayed notes against a failed defense", () => {
        const engine = play(0.35);
        expect(engine.contractScore()).toBeLessThan(engine.accuracy());
    });
});
