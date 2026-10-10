// Every sound of the defense through the Web Audio API: the level's music track, played in
// sync with the chart, and the effects synthesised on the spot, most of them Swiss or ETH
// in-jokes: a cowbell for milestones, the Zürich tram bell for Eureka, a sad trombone for a
// failed defense and a fanfare for a passed one.
//
// Browsers only allow audio after a user gesture, so nothing is created until unlock() is
// called from a key or click handler.

export function midiToHz(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
}

export interface SoundStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const MUTE_KEY = "eth-life:thesis-defense:muted";
const MASTER_GAIN = 0.7;
const TRACK_GAIN = 0.85;

type Wave = OscillatorType;

export default class Synth {
    private readonly makeContext: () => AudioContext;
    private readonly storage: SoundStorage;
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private music: GainNode | null = null;
    private sfx: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private track: AudioBuffer | null = null;
    private trackSource: AudioBufferSourceNode | null = null;
    private trackGain: GainNode | null = null;
    private disposed = false;
    muted: boolean;

    constructor(storage: SoundStorage, makeContext?: () => AudioContext) {
        this.storage = storage;
        this.makeContext = makeContext ?? (() => new AudioContext());
        this.muted = this.readMuted();
    }

    // Seconds on the audio clock for a moment `msFromNow` in the future.
    at(msFromNow: number): number {
        return (this.ctx?.currentTime ?? 0) + Math.max(0, msFromNow) / 1000;
    }

    get isReady(): boolean {
        return this.ctx !== null && !this.disposed;
    }

    // Call from a user gesture. Safe to call often; failures leave the game silent, not broken.
    unlock() {
        if (this.disposed) return;
        try {
            if (!this.ctx) this.build();
            if (this.ctx?.state === "suspended") void this.ctx.resume();
        } catch {
            this.ctx = null; // no Web Audio here: play on in silence
        }
    }

    toggleMute(): boolean {
        this.muted = !this.muted;
        try {
            this.storage.setItem(MUTE_KEY, this.muted ? "1" : "0");
        } catch {
            // Storage denied: the switch still works for this visit.
        }
        if (this.master && this.ctx)
            this.master.gain.setTargetAtTime(
                this.muted ? 0 : MASTER_GAIN,
                this.ctx.currentTime,
                0.02,
            );
        return this.muted;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.stopTrack();
        const ctx = this.ctx;
        this.ctx = null;
        if (ctx && ctx.state !== "closed")
            void ctx.close().catch(() => undefined);
    }

    // --- Music ---------------------------------------------------------------

    // One struck piano key: a bright attack that rings out, like a Piano Tiles tile.
    piano(midi: number, velocity = 1, when = this.at(0)) {
        const out = this.voice(this.music, when, 0.004, 1.1, 0.32 * velocity);
        if (!out) return;
        const hz = midiToHz(midi);
        this.osc("triangle", hz, when, when + 1.2, out);
        this.osc("sine", hz * 2, when, when + 0.5, out, 0.25);
        this.osc("sine", hz / 2, when, when + 0.8, out, 0.2);
    }

    // --- The track -----------------------------------------------------------

    // Decodes the music once the context exists; resolves false if it cannot be played.
    async loadTrack(data: ArrayBuffer): Promise<boolean> {
        const ctx = this.ctx;
        if (!ctx || this.track) return Boolean(this.track);
        try {
            this.track = await ctx.decodeAudioData(data.slice(0));
            return true;
        } catch {
            return false; // an unsupported codec: the defense plays on in silence
        }
    }

    get hasTrack(): boolean {
        return this.track !== null;
    }

    // Plays the track so that track time `offsetMs` is heard `inMs` from now, compensating
    // for the device's output latency so the music lines up with the notes on screen.
    playTrack(offsetMs: number, inMs: number) {
        const ctx = this.ctx;
        if (!ctx || !this.track || !this.music) return;
        this.stopTrack();
        const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
        let when = ctx.currentTime + Math.max(0, inMs) / 1000 - latency;
        let offset = Math.max(0, offsetMs) / 1000;
        if (when < ctx.currentTime) {
            offset += ctx.currentTime - when;
            when = ctx.currentTime;
        }
        if (offset >= this.track.duration) return;
        const source = ctx.createBufferSource();
        source.buffer = this.track;
        const gain = ctx.createGain();
        gain.gain.value = TRACK_GAIN;
        source.connect(gain).connect(this.music);
        source.start(when, offset);
        this.trackSource = source;
        this.trackGain = gain;
    }

    // Stops the track, optionally fading it out first (a failed defense).
    stopTrack(fadeMs = 0) {
        const ctx = this.ctx;
        const source = this.trackSource;
        if (!source || !ctx) return;
        this.trackSource = null;
        const gain = this.trackGain;
        this.trackGain = null;
        try {
            if (fadeMs > 0 && gain) {
                gain.gain.setTargetAtTime(0, ctx.currentTime, fadeMs / 4000);
                source.stop(ctx.currentTime + fadeMs / 1000);
            } else source.stop();
        } catch {
            // Already stopped.
        }
    }

    // A defended reference: a soft ballpoint tick that never fights the music.
    tick(velocity = 1) {
        const when = this.at(0);
        this.noiseHit(when, 0.03, 4200, "bandpass", 0.32 * velocity, this.sfx);
        const out = this.voice(this.sfx, when, 0.002, 0.06, 0.08 * velocity);
        if (out) this.osc("sine", 2600, when, when + 0.08, out);
    }

    // --- Effects -------------------------------------------------------------

    // A wrong note: two clashing keys, a semitone apart, slightly flat.
    miss() {
        const when = this.at(0);
        const out = this.voice(this.sfx, when, 0.005, 0.35, 0.22);
        if (!out) return;
        const square = this.osc("square", 196, when, when + 0.35, out, 0.5);
        this.osc("square", 207.65, when, when + 0.35, out, 0.5);
        square?.frequency.exponentialRampToValueAtTime(150, when + 0.3);
    }

    // A press that answered nothing: a dull knock on the desk.
    stray() {
        this.noiseHit(this.at(0), 0.06, 400, "lowpass", 0.25);
    }

    // The 808 cowbell recipe (two detuned squares through a bandpass): very Swiss.
    cowbell(when = this.at(0)) {
        const ctx = this.ctx;
        if (!ctx || !this.sfx) return;
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 2640;
        band.connect(this.sfx);
        const out = this.voice(band, when, 0.002, 0.45, 0.35);
        if (!out) return;
        this.osc("square", 540, when, when + 0.5, out);
        this.osc("square", 800, when, when + 0.5, out);
    }

    // Combo milestone: cowbell, then a quick rising arpeggio.
    milestone() {
        const when = this.at(0);
        this.cowbell(when);
        [72, 76, 79, 84].forEach((midi, i) =>
            this.piano(midi, 0.7, when + 0.09 + i * 0.07),
        );
    }

    // Eureka: the Zürich tram bell, ding-ding.
    tramBell() {
        const when = this.at(0);
        for (const strike of [0, 0.16]) {
            const out = this.voice(this.sfx, when + strike, 0.002, 0.9, 0.28);
            if (!out) continue;
            for (const [hz, gain] of [
                [1318, 1],
                [1976, 0.5],
                [3290, 0.2],
            ])
                this.osc(
                    "sine",
                    hz,
                    when + strike,
                    when + strike + 1,
                    out,
                    gain,
                );
        }
    }

    golden() {
        const when = this.at(0);
        [88, 91].forEach((midi, i) => this.piano(midi, 0.45, when + i * 0.05));
    }

    // Countdown: three beeps, then a higher "DEFEND!".
    countdown(isGo: boolean) {
        const when = this.at(0);
        const out = this.voice(this.sfx, when, 0.003, isGo ? 0.5 : 0.15, 0.2);
        if (out)
            this.osc("square", isGo ? 1760 : 880, when, when + 0.5, out, 0.6);
    }

    // A new phase: a low gong; the meltdown gets an alarm on top.
    phase(isMeltdown: boolean) {
        const when = this.at(0);
        const out = this.voice(this.sfx, when, 0.01, 1.6, 0.3);
        if (out) {
            this.osc("sine", 98, when, when + 1.6, out);
            this.osc("sine", 147, when, when + 1.2, out, 0.4);
        }
        if (!isMeltdown) return;
        for (let i = 0; i < 3; i++) {
            const t = when + i * 0.22;
            const alarm = this.voice(this.sfx, t, 0.005, 0.18, 0.12);
            const osc = alarm && this.osc("sawtooth", 660, t, t + 0.2, alarm);
            osc?.frequency.linearRampToValueAtTime(990, t + 0.18);
        }
    }

    // The defense failed: the sad trombone, wah wah wah waaah.
    sadTrombone() {
        const ctx = this.ctx;
        if (!ctx || !this.sfx) return;
        const when = this.at(80);
        const low = ctx.createBiquadFilter();
        low.type = "lowpass";
        low.frequency.value = 1100;
        low.connect(this.sfx);
        [58, 57, 56, 55].forEach((midi, i) => {
            const t = when + i * 0.42;
            const long = i === 3;
            const out = this.voice(low, t, 0.03, long ? 1.3 : 0.38, 0.3);
            const osc =
                out &&
                this.osc(
                    "sawtooth",
                    midiToHz(midi),
                    t,
                    t + (long ? 1.4 : 0.42),
                    out,
                );
            if (osc && long) {
                const lfo = ctx.createOscillator();
                const depth = ctx.createGain();
                lfo.frequency.value = 6;
                depth.gain.value = 4;
                lfo.connect(depth).connect(osc.frequency);
                lfo.start(t);
                lfo.stop(t + 1.4);
            }
        });
    }

    // The defense passed: a graduation fanfare.
    fanfare() {
        const when = this.at(80);
        [67, 72, 76, 79].forEach((midi, i) =>
            this.piano(midi, 0.8, when + i * 0.12),
        );
        [72, 76, 79, 84].forEach((midi) => this.piano(midi, 0.6, when + 0.55));
        this.cowbell(when + 0.55);
    }

    // The verdict stamp hitting the card.
    stamp() {
        this.kick(this.at(0), 0.8);
        this.noiseHit(this.at(0), 0.08, 900, "lowpass", 0.3);
    }

    // --- Building blocks -----------------------------------------------------

    private build() {
        const ctx = this.makeContext();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
        this.master.connect(ctx.destination);
        this.music = ctx.createGain();
        this.music.gain.value = 0.8;
        this.music.connect(this.master);
        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);
        const length = Math.floor(ctx.sampleRate * 0.5);
        this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }

    // A gain node with a percussive envelope, connected to `into`; null while silent.
    private voice(
        into: AudioNode | null,
        when: number,
        attack: number,
        decay: number,
        peak: number,
    ): GainNode | null {
        const ctx = this.ctx;
        if (!ctx || !into || this.disposed) return null;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(peak, when + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
        gain.connect(into);
        return gain;
    }

    private osc(
        type: Wave,
        hz: number,
        start: number,
        stop: number,
        into: AudioNode,
        level = 1,
    ): OscillatorNode | null {
        const ctx = this.ctx;
        if (!ctx) return null;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = hz;
        if (level === 1) osc.connect(into);
        else {
            const trim = ctx.createGain();
            trim.gain.value = level;
            osc.connect(trim).connect(into);
        }
        osc.start(start);
        osc.stop(stop);
        return osc;
    }

    private kick(when: number, peak: number) {
        const out = this.voice(this.music, when, 0.002, 0.25, peak);
        const osc = out && this.osc("sine", 120, when, when + 0.3, out);
        osc?.frequency.exponentialRampToValueAtTime(42, when + 0.2);
    }

    private noiseHit(
        when: number,
        decay: number,
        hz: number,
        type: BiquadFilterType,
        peak: number,
        bus: GainNode | null = this.music,
    ) {
        const ctx = this.ctx;
        if (!ctx || !this.noise || !bus) return;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = hz;
        const out = this.voice(filter, when, 0.001, decay, peak);
        if (!out) return;
        filter.connect(bus);
        const source = ctx.createBufferSource();
        source.buffer = this.noise;
        source.connect(out);
        source.start(when);
        source.stop(when + decay + 0.05);
    }

    private readMuted(): boolean {
        try {
            return this.storage.getItem(MUTE_KEY) === "1";
        } catch {
            return false;
        }
    }
}
