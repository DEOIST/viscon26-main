import { describe, expect, it, vi } from "vitest";
import Synth from "./Synth";

// Just enough of the Web Audio API to run every sound without a browser.
function fakeContext() {
    const param = () => ({
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
    });
    const node = () => {
        const n = {
            connect: vi.fn(() => n),
            gain: param(),
            frequency: param(),
            type: "",
            buffer: null as unknown,
            start: vi.fn(),
            stop: vi.fn(),
        };
        return n;
    };
    const ctx = {
        state: "running",
        currentTime: 10,
        sampleRate: 8000,
        destination: node(),
        oscillators: 0,
        createGain: vi.fn(node),
        createBiquadFilter: vi.fn(node),
        createBufferSource: vi.fn(node),
        createOscillator: vi.fn(() => {
            ctx.oscillators += 1;
            return node();
        }),
        createBuffer: vi.fn((_c: number, length: number) => ({
            getChannelData: () => new Float32Array(length),
        })),
        resume: vi.fn(() => Promise.resolve()),
        decodeAudioData: vi.fn(() => Promise.resolve({ duration: 60 })),
        outputLatency: 0.02,
        baseLatency: 0,
        close: vi.fn(() => Promise.resolve()),
    };
    return ctx;
}

function memoryStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => {
            data[key] = value;
        },
    };
}

describe("Synth", () => {
    it("creates no audio context until a user gesture unlocks it", () => {
        const ctx = fakeContext();
        const make = vi.fn(() => ctx as unknown as AudioContext);
        const synth = new Synth(memoryStorage(), make);
        synth.piano(60);
        synth.miss();
        expect(make).not.toHaveBeenCalled();
        synth.unlock();
        synth.unlock();
        expect(make).toHaveBeenCalledOnce();
        expect(synth.isReady).toBe(true);
    });

    it("plays every sound once unlocked without throwing", () => {
        const ctx = fakeContext();
        const synth = new Synth(
            memoryStorage(),
            () => ctx as unknown as AudioContext,
        );
        synth.unlock();
        synth.piano(72);
        synth.tick();
        synth.miss();
        synth.stray();
        synth.milestone();
        synth.tramBell();
        synth.golden();
        synth.countdown(false);
        synth.countdown(true);
        synth.phase(true);
        synth.sadTrombone();
        synth.fanfare();
        synth.stamp();
        expect(ctx.oscillators).toBeGreaterThan(30);
    });

    it("remembers mute across visits", () => {
        const storage = memoryStorage();
        const synth = new Synth(
            storage,
            () => fakeContext() as unknown as AudioContext,
        );
        expect(synth.muted).toBe(false);
        expect(synth.toggleMute()).toBe(true);
        expect(new Synth(storage).muted).toBe(true);
    });

    it("plays on in silence when Web Audio is missing", () => {
        const synth = new Synth(memoryStorage(), () => {
            throw new Error("no audio");
        });
        synth.unlock();
        expect(synth.isReady).toBe(false);
        expect(() => synth.fanfare()).not.toThrow();
    });

    it("closes the context once on dispose and stays silent afterwards", () => {
        const ctx = fakeContext();
        const synth = new Synth(
            memoryStorage(),
            () => ctx as unknown as AudioContext,
        );
        synth.unlock();
        synth.dispose();
        synth.dispose();
        expect(ctx.close).toHaveBeenCalledOnce();
        synth.unlock();
        const before = ctx.oscillators;
        synth.piano(60);
        expect(ctx.oscillators).toBe(before);
    });

    it("plays the decoded track from a song position, latency-compensated", async () => {
        const ctx = fakeContext();
        const sources: {
            start: ReturnType<typeof vi.fn>;
            stop: ReturnType<typeof vi.fn>;
        }[] = [];
        const createSource = ctx.createBufferSource;
        ctx.createBufferSource = vi.fn(() => {
            const source = createSource();
            sources.push(source);
            return source;
        });
        const synth = new Synth(
            memoryStorage(),
            () => ctx as unknown as AudioContext,
        );
        synth.unlock();
        expect(await synth.loadTrack(new ArrayBuffer(8))).toBe(true);
        expect(synth.hasTrack).toBe(true);
        synth.playTrack(0, 2000); // the countdown: start 2 s from now, from the top
        expect(sources.at(-1)!.start).toHaveBeenCalledWith(10 + 2 - 0.02, 0);
        synth.playTrack(15_000, 0); // a resume mid-song: catches up by the latency
        expect(sources[0].stop).toHaveBeenCalled();
        const [when, offset] = sources.at(-1)!.start.mock.calls[0];
        expect(when).toBe(10);
        expect(offset).toBeCloseTo(15.02);
        synth.playTrack(61_000, 0); // past the end: nothing to play
        expect(sources).toHaveLength(2);
    });
});
