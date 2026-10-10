import { describe, expect, it, vi } from "vitest";
import { DEFENSE_CHART } from "./chart";
import Soundtrack from "./Soundtrack";
import type Synth from "./Synth";

function fakeSynth(hasTrack = true) {
    return {
        isReady: true,
        hasTrack,
        muted: false,
        unlock: vi.fn(),
        loadTrack: vi.fn(() => Promise.resolve(true)),
        playTrack: vi.fn(),
        stopTrack: vi.fn(),
        toggleMute: vi.fn(() => true),
        dispose: vi.fn(),
        tick: vi.fn(),
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
const make = (synth: ReturnType<typeof fakeSynth>) =>
    new Soundtrack(DEFENSE_CHART, storage, synth as unknown as Synth, () =>
        Promise.resolve(new ArrayBuffer(8)),
    );

describe("Soundtrack", () => {
    it("starts the track so that song time 0 is its first sample", () => {
        vi.spyOn(performance, "now").mockReturnValue(10_000);
        const synth = fakeSynth();
        const track = make(synth);
        track.play(-2400);
        expect(synth.playTrack).toHaveBeenCalledWith(0, 2400);
        track.play(15_000);
        expect(synth.playTrack).toHaveBeenLastCalledWith(15_000, 0);
    });

    it("stops the music on pause and fades it on a failed defense", () => {
        const synth = fakeSynth();
        const track = make(synth);
        track.play(0);
        track.pause();
        expect(synth.stopTrack).toHaveBeenCalledWith(0);
        track.event({ type: "failed" });
        expect(synth.stopTrack).toHaveBeenLastCalledWith(600);
        expect(synth.sadTrombone).toHaveBeenCalledOnce();
    });

    it("ticks softly on a hit instead of playing over the music", () => {
        const synth = fakeSynth();
        const track = make(synth);
        const note = DEFENSE_CHART.notes[0];
        track.event({
            type: "hit",
            note,
            judgment: "good",
            delta: 100,
            points: 40,
        });
        expect(synth.tick).toHaveBeenCalledWith(0.65);
        track.event({ type: "miss", note });
        expect(synth.miss).toHaveBeenCalledOnce();
    });

    it("starts a track that finishes decoding late at the right position", async () => {
        const synth = fakeSynth(false);
        const now = vi.spyOn(performance, "now").mockReturnValue(1000);
        const track = make(synth);
        track.play(-500); // song time 0 is 500 ms from now
        expect(synth.playTrack).not.toHaveBeenCalled();
        now.mockReturnValue(1800); // decoded 800 ms later: 300 ms into the song
        synth.hasTrack = true;
        await track.unlock();
        expect(synth.playTrack).toHaveBeenCalledWith(300, 0);
    });
});
