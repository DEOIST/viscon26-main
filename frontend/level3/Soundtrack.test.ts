import { describe, expect, it, vi } from "vitest";
import { DEFENSE_CHART } from "./chart";
import Soundtrack, { clockCorrection } from "./Soundtrack";
import type Synth from "./Synth";

function fakeSynth(hasTrack = true, trackDurationMs = 61_875) {
    return {
        isReady: true,
        hasTrack,
        trackDurationMs,
        heardTrackMs: vi.fn((_now: number): number | null => null),
        muted: false,
        unlock: vi.fn(),
        loadTrack: vi.fn((_data?: ArrayBuffer) => Promise.resolve(true)),
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
    new Soundtrack(DEFENSE_CHART, storage, synth as unknown as Synth, [
        () => Promise.resolve(new ArrayBuffer(8)),
    ]);

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

    // Safari cannot decode Ogg Vorbis: the same track as AAC must take over.
    it("falls back to the next file when the browser cannot decode the first", async () => {
        const synth = fakeSynth(false);
        const ogg = new ArrayBuffer(8);
        const m4a = new ArrayBuffer(16);
        synth.loadTrack.mockImplementation((data?: ArrayBuffer) => {
            if (data === m4a) synth.hasTrack = true;
            return Promise.resolve(data === m4a);
        });
        const fetchM4a = vi.fn(() => Promise.resolve(m4a));
        const track = new Soundtrack(
            DEFENSE_CHART,
            storage,
            synth as unknown as Synth,
            [() => Promise.resolve(ogg), fetchM4a],
        );
        track.play(0);
        await track.unlock();
        expect(synth.loadTrack).toHaveBeenCalledTimes(2);
        expect(fetchM4a).toHaveBeenCalledOnce();
        expect(synth.playTrack).toHaveBeenCalled();
    });
});

describe("keeping the song clock on the music", () => {
    it("ignores jitter, eases small errors and snaps big ones", () => {
        expect(clockCorrection(10_000, 10_001)).toBe(0); // below the deadband
        expect(clockCorrection(10_000, 10_020)).toBeCloseTo(2); // a tenth of 20 ms
        expect(clockCorrection(10_000, 9_980)).toBeCloseTo(-2);
        expect(clockCorrection(10_000, 10_500)).toBe(500); // a restart: take it at once
    });

    it("converges onto music that started late without jumping", () => {
        let song = 5_000;
        const heard = 4_960; // the audio context woke up 40 ms late
        let largestStep = 0;
        for (let frame = 0; frame < 60; frame++) {
            const step = clockCorrection(song, heard);
            largestStep = Math.max(largestStep, Math.abs(step));
            song += step;
        }
        expect(Math.abs(song - heard)).toBeLessThan(2.5); // within the deadband after 1 s
        expect(largestStep).toBeLessThanOrEqual(4); // never more than 4 ms in one frame
    });

    it("reports the heard song time only while the song is playing", () => {
        const synth = fakeSynth();
        synth.heardTrackMs.mockReturnValue(12_345);
        const track = make(synth);
        expect(track.heardSongTime(0)).toBeNull();
        track.play(12_000);
        expect(track.heardSongTime(0)).toBe(12_345);
        track.pause();
        expect(track.heardSongTime(0)).toBeNull();
    });
});

describe("codec padding", () => {
    async function startedWith(trackDurationMs: number) {
        vi.spyOn(performance, "now").mockReturnValue(10_000);
        const synth = fakeSynth(true, trackDurationMs);
        synth.heardTrackMs.mockReturnValue(1_000);
        const track = make(synth);
        await track.unlock();
        track.play(-2400);
        return { synth, track };
    }

    it("skips the AAC encoder delay when the decoder kept it", async () => {
        // 2112 priming + 208 tail samples at 44.1 kHz: the whole AAC stream, untrimmed.
        const { synth, track } = await startedWith(61_875 + 52.4);
        const [offset, wait] = synth.playTrack.mock.lastCall!;
        expect(offset).toBeCloseTo(47.9, 1);
        expect(wait).toBe(2400);
        expect(track.heardSongTime(0)).toBeCloseTo(1_000 - 47.9, 1);
    });

    it("leaves a decoder's few ms of tail padding alone", async () => {
        // Chrome decodes the Ogg 7.6 ms longer than the file's music; its start is exact.
        const { synth, track } = await startedWith(61_875 + 7.6);
        expect(synth.playTrack).toHaveBeenLastCalledWith(0, 2400);
        expect(track.heardSongTime(0)).toBe(1_000);
    });
});
