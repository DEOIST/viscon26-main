import { describe, expect, it, vi } from "vitest";
import { BAR_MS, DEFENSE_CHART } from "./chart";
import { buildCues } from "./music";
import Soundtrack from "./Soundtrack";
import type Synth from "./Synth";

function fakeSynth() {
    return {
        isReady: true,
        muted: false,
        at: (ms: number) => ms / 1000,
        unlock: vi.fn(),
        toggleMute: vi.fn(() => true),
        dispose: vi.fn(),
        piano: vi.fn(),
        groove: vi.fn(),
        miss: vi.fn(),
        stray: vi.fn(),
        milestone: vi.fn(),
        tramBell: vi.fn(),
        golden: vi.fn(),
        countdown: vi.fn(),
        phase: vi.fn(),
        sadTrombone: vi.fn(),
        fanfare: vi.fn(),
        stamp: vi.fn(),
    };
}

const storage = { getItem: () => null, setItem: () => undefined };

describe("Soundtrack", () => {
    it("plays the note's own melody pitch on a hit, softer for weaker timing", () => {
        const synth = fakeSynth();
        const track = new Soundtrack(
            DEFENSE_CHART,
            storage,
            synth as unknown as Synth,
        );
        const note = DEFENSE_CHART.notes[0];
        track.event({
            type: "hit",
            note,
            judgment: "good",
            delta: 100,
            points: 40,
        });
        expect(synth.piano).toHaveBeenCalledWith(
            buildCues(DEFENSE_CHART).get(note.id),
            0.65,
        );
        track.event({ type: "miss", note });
        track.event({ type: "failed" });
        expect(synth.miss).toHaveBeenCalledOnce();
        expect(synth.sadTrombone).toHaveBeenCalledOnce();
    });

    it("schedules each beat of the groove exactly once", () => {
        const synth = fakeSynth();
        const track = new Soundtrack(
            DEFENSE_CHART,
            storage,
            synth as unknown as Synth,
        );
        track.restart(-500);
        const origin = DEFENSE_CHART.phases[0].time;
        // Frames every 16 ms, stopping before the lookahead reaches bar 3.
        const scheduled: number[] = [];
        for (let song = -500; song < origin + 2 * BAR_MS - 150; song += 16) {
            const before = synth.groove.mock.calls.length;
            track.schedule(song);
            for (const [hit, when] of synth.groove.mock.calls.slice(before))
                if (hit.kind === "kick") scheduled.push(when * 1000 + song);
        }
        // Opening: kicks on beats 1 and 3 of two bars, each once, on the beat grid.
        expect(scheduled).toHaveLength(4);
        expect(new Set(scheduled.map(Math.round)).size).toBe(4);
        scheduled.forEach((time, i) =>
            expect(time).toBeCloseTo(origin + i * (BAR_MS / 2), 5),
        );
    });

    it("stays silent before the browser allows audio", () => {
        const synth = { ...fakeSynth(), isReady: false };
        const track = new Soundtrack(
            DEFENSE_CHART,
            storage,
            synth as unknown as Synth,
        );
        track.restart(0);
        track.schedule(1000);
        expect(synth.groove).not.toHaveBeenCalled();
    });
});
