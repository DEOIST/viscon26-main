// The result gauge's sound: a ratchet that clicks, rising in pitch, each time the needle passes a
// step of the dial, and a bell when it reaches the reading. Synthesised with Web Audio on the
// audio clock, so every click sits on the needle's own curve and a better result climbs further.
import { synthAudio } from "./audio";

// How the needle moves, as its CSS animation states it. The easing is a cubic-bezier whose y may
// pass 1: the needle then overshoots the reading and settles back.
export interface NeedleMotion {
    delayMs: number;
    sweepMs: number;
    easing: readonly [number, number, number, number];
}

export interface GaugeClick {
    atMs: number;
    position: number; // on the dial, 0..1
}

export interface GaugeSchedule {
    clicks: GaugeClick[];
    landMs: number; // the needle first reaches the reading
}

const DIAL_CLICKS = 20; // one click per 5 % of the dial
const VOLUME = 0.5;
const CLICK_GAIN = 0.3;
const CLICK_SECONDS = 0.03;
const CLICK_HZ = [700, 2100]; // at the dial's left and right end
const BELL_GAIN = 0.3;
const BELL_SECONDS = 0.5;
const BELL_HZ = [523, 1047]; // for an empty and a full reading: C5 to C6
const BELL_OVERTONE = 0.35; // an octave above, this much quieter

const bezier = (a: number, b: number, s: number) =>
    3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
const between = ([low, high]: number[], share: number) =>
    low * (high / low) ** share;

// Milliseconds until the needle first reaches `fraction` (0..1) of its way to the reading.
function reachMs(fraction: number, motion: NeedleMotion): number {
    const [x1, y1, x2, y2] = motion.easing;
    const SAMPLES = 240;
    for (let sample = 1; sample <= SAMPLES; sample++) {
        if (bezier(y1, y2, sample / SAMPLES) < fraction) continue;
        let low = (sample - 1) / SAMPLES;
        let high = sample / SAMPLES;
        for (let pass = 0; pass < 20; pass++) {
            const middle = (low + high) / 2;
            if (bezier(y1, y2, middle) < fraction) low = middle;
            else high = middle;
        }
        return motion.delayMs + motion.sweepMs * bezier(x1, x2, high);
    }
    return motion.delayMs + motion.sweepMs;
}

// When each click and the bell sound for a needle sweeping from zero to `share` of the dial.
export function gaugeSchedule(
    share: number,
    motion: NeedleMotion,
): GaugeSchedule {
    const reading = Math.min(1, Math.max(0, share));
    const clicks: GaugeClick[] = [];
    const steps = Math.floor(reading * DIAL_CLICKS + 1e-9);
    for (let step = 1; step <= steps; step++) {
        const position = step / DIAL_CLICKS;
        clicks.push({
            atMs: reachMs(Math.min(1, position / reading), motion),
            position,
        });
    }
    return { clicks, landMs: reachMs(1, motion) };
}

// Plays the sweep and returns a function that silences it, for a gauge that leaves mid-sweep.
// Silent when the needle doesn't move, and before the player's first click or key press.
export function playGaugeSound(
    share: number,
    motion: NeedleMotion,
    ctx: AudioContext | null = synthAudio(),
): () => void {
    if (!ctx || share <= 0) return () => undefined;
    const { clicks, landMs } = gaugeSchedule(share, motion);
    const reading = Math.min(1, share);
    const start = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = VOLUME;
    out.connect(ctx.destination);

    const blip = (
        wave: OscillatorType,
        hz: number,
        atMs: number,
        peak: number,
        seconds: number,
    ) => {
        const at = start + atMs / 1000;
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        oscillator.type = wave;
        oscillator.frequency.value = hz;
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(peak, at + 0.002);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
        oscillator.connect(envelope).connect(out);
        oscillator.start(at);
        oscillator.stop(at + seconds + 0.02);
        return oscillator;
    };

    for (const click of clicks)
        blip(
            "triangle",
            between(CLICK_HZ, click.position),
            click.atMs,
            CLICK_GAIN,
            CLICK_SECONDS,
        );
    const bellHz = between(BELL_HZ, reading);
    blip("sine", bellHz * 2, landMs, BELL_GAIN * BELL_OVERTONE, BELL_SECONDS);
    // The bell's fundamental ends last: nothing is left to hear, so release the nodes.
    blip("sine", bellHz, landMs, BELL_GAIN, BELL_SECONDS).onended = () =>
        out.disconnect();

    return () => {
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    };
}
