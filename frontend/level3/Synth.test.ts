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

describe("the heard position of the track", () => {
    async function playing(
        stamp: { contextTime: number; performanceTime: number } | null,
    ) {
        const ctx = fakeContext() as ReturnType<typeof fakeContext> & {
            getOutputTimestamp?: () => {
                contextTime: number;
                performanceTime: number;
            };
        };
        if (stamp) ctx.getOutputTimestamp = () => stamp;
        const synth = new Synth(
            memoryStorage(),
            () => ctx as unknown as AudioContext,
        );
        synth.unlock();
        await synth.loadTrack(new ArrayBuffer(8));
        return synth;
    }

    it("reads what the speakers play from the output timestamp", async () => {
        // At audio time 10 s the track starts 5 s in; 20 ms of output latency is folded into
        // the start, so it begins at 5.02 s. Half a second later the speakers play 5.52 s.
        const synth = await playing({
            contextTime: 10.5,
            performanceTime: 1_000,
        });
        synth.playTrack(5_000, 0);
        expect(synth.heardTrackMs(1_000)).toBeCloseTo(5_520);
        expect(synth.heardTrackMs(1_100)).toBeCloseTo(5_620); // 100 ms later on the page clock
    });

    it("says nothing before the track sounds or when the browser can't tell", async () => {
        const early = await playing({
            contextTime: 9.9,
            performanceTime: 1_000,
        });
        early.playTrack(0, 0);
        expect(early.heardTrackMs(1_000)).toBeNull(); // scheduled for 10 s, not heard yet
        const warmingUp = await playing({ contextTime: 0, performanceTime: 0 });
        warmingUp.playTrack(0, 0);
        expect(warmingUp.heardTrackMs(1_000)).toBeNull();
        const noTimestamp = await playing(null);
        noTimestamp.playTrack(0, 0);
        expect(noTimestamp.heardTrackMs(1_000)).toBeNull();
        const stopped = await playing({
            contextTime: 10.5,
            performanceTime: 1_000,
        });
        expect(stopped.heardTrackMs(1_000)).toBeNull(); // nothing playing
    });
});
