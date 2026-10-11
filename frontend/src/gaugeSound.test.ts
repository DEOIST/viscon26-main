import { describe, expect, it, vi } from "vitest";
import { gaugeSchedule, playGaugeSound } from "./gaugeSound";
import type { NeedleMotion } from "./gaugeSound";

// The result gauge's needle (LectureResult): it overshoots, so it first arrives well before the end.
const NEEDLE: NeedleMotion = {
    delayMs: 150,
    sweepMs: 1100,
    easing: [0.3, 1.35, 0.5, 1],
};
// A needle moving at a constant speed: it is at `x` of its way after `x` of the second.
const STEADY: NeedleMotion = {
    delayMs: 0,
    sweepMs: 1000,
    easing: [0, 0, 1, 1],
};

// Just enough of the Web Audio API to schedule the sound without a browser.
function fakeContext() {
    const param = () => ({
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
    });
    const node = () => {
        const n = {
            connect: vi.fn((to: unknown) => to),
            disconnect: vi.fn(),
            gain: param(),
            frequency: param(),
            type: "",
            start: vi.fn(),
            stop: vi.fn(),
            onended: null as (() => void) | null,
        };
        return n;
    };
    const oscillators: ReturnType<typeof node>[] = [];
    const gains: ReturnType<typeof node>[] = [];
    return {
        state: "running",
        currentTime: 10,
        destination: node(),
        oscillators,
        gains,
        createGain: vi.fn(() => {
            gains.push(node());
            return gains[gains.length - 1];
        }),
        createOscillator: vi.fn(() => {
            oscillators.push(node());
            return oscillators[oscillators.length - 1];
        }),
    };
}

describe("gaugeSchedule", () => {
    it("clicks once for every 5 % of the dial the needle passes", () => {
        const { clicks, landMs } = gaugeSchedule(1, STEADY);
        expect(clicks).toHaveLength(20);
        clicks.forEach((click, index) => {
            expect(click.position).toBeCloseTo((index + 1) / 20);
            expect(click.atMs).toBeCloseTo(50 * (index + 1), 3);
        });
        expect(landMs).toBeCloseTo(1000, 3);
    });

    it("spreads a lower reading's fewer clicks over the same sweep", () => {
        const { clicks, landMs } = gaugeSchedule(0.5, STEADY);
        expect(clicks.map((click) => Math.round(click.atMs))).toEqual([
            100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
        ]);
        expect(clicks[clicks.length - 1].position).toBe(0.5);
        expect(landMs).toBeCloseTo(1000, 3);
    });

    it("follows the needle's easing: a fast start, slowing into the reading", () => {
        const { clicks, landMs } = gaugeSchedule(1, NEEDLE);
        const gaps = clicks
            .slice(1)
            .map((click, index) => click.atMs - clicks[index].atMs);
        expect(clicks[0].atMs).toBeGreaterThan(NEEDLE.delayMs);
        gaps.forEach((gap) => expect(gap).toBeGreaterThan(0));
        expect(gaps[gaps.length - 1]).toBeGreaterThan(3 * gaps[0]);
        // The needle reaches the reading, overshoots it and settles: the bell marks the arrival.
        expect(clicks[clicks.length - 1].atMs).toBeCloseTo(landMs, 3);
        expect(landMs).toBeGreaterThan(550);
        expect(landMs).toBeLessThan(700);
    });

    it("stays silent below the first step and never passes the end of the dial", () => {
        expect(gaugeSchedule(0, NEEDLE).clicks).toEqual([]);
        expect(gaugeSchedule(0.04, NEEDLE).clicks).toEqual([]);
        expect(gaugeSchedule(1.7, NEEDLE).clicks).toHaveLength(20);
    });
});

describe("playGaugeSound", () => {
    it("schedules a click per step and a two-part bell on the audio clock", () => {
        const ctx = fakeContext();
        playGaugeSound(0.5, NEEDLE, ctx as unknown as AudioContext);
        expect(ctx.oscillators).toHaveLength(10 + 2);
        const starts = ctx.oscillators.map(
            (oscillator) => oscillator.start.mock.calls[0][0] as number,
        );
        // Nothing sounds before the needle's delay has passed on the context's own clock.
        expect(Math.min(...starts)).toBeGreaterThan(10 + 0.15);
        expect(Math.max(...starts)).toBeLessThan(10 + 0.7);
        ctx.oscillators.forEach((oscillator) =>
            expect(oscillator.stop).toHaveBeenCalledOnce(),
        );
    });

    it("climbs higher, and rings higher, for a better result", () => {
        const pitches = (share: number) => {
            const ctx = fakeContext();
            playGaugeSound(share, NEEDLE, ctx as unknown as AudioContext);
            return ctx.oscillators.map(
                (oscillator) => oscillator.frequency.value,
            );
        };
        const low = pitches(0.25);
        const full = pitches(1);
        const lastClick = (all: number[]) => all[all.length - 3];
        const bell = (all: number[]) => all[all.length - 1];
        expect(lastClick(full)).toBeGreaterThan(lastClick(low));
        expect(bell(full)).toBeGreaterThan(bell(low));
    });

    it("silences a sweep that is stopped and releases its nodes when it ends", () => {
        const ctx = fakeContext();
        const stop = playGaugeSound(1, NEEDLE, ctx as unknown as AudioContext);
        const out = ctx.gains[0];
        expect(out.connect).toHaveBeenCalledWith(ctx.destination);
        stop();
        expect(out.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10, 0.01);
        ctx.oscillators[ctx.oscillators.length - 1].onended?.();
        expect(out.disconnect).toHaveBeenCalledOnce();
    });

    it("plays nothing for a needle that stays at zero or without a running context", () => {
        const ctx = fakeContext();
        expect(
            playGaugeSound(0, NEEDLE, ctx as unknown as AudioContext),
        ).not.toThrow();
        expect(ctx.oscillators).toHaveLength(0);
        // jsdom has no Web Audio and no gesture has unlocked a context: silent, not broken.
        expect(playGaugeSound(1, NEEDLE)).not.toThrow();
    });
});
