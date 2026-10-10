// Turns the defense into sound: the scene forwards engine events and the song clock, and this
// picks the melody note for each hit (Piano Tiles style, music.ts), keeps the groove scheduled
// a little ahead on the audio clock, and fires the effects in Synth.ts.

import { BAR_MS } from "./chart";
import type { Chart, Phase } from "./chart";
import type { DefenseEvent } from "./engine";
import { PIECES, beatsBetween, buildCues, grooveAt } from "./music";
import Synth from "./Synth";
import type { SoundStorage } from "./Synth";

const BEAT_MS = BAR_MS / 4;
const LOOKAHEAD_MS = 120; // groove scheduled this far ahead, so frame hiccups never gap it
const VELOCITY = { perfect: 1, great: 0.85, good: 0.65 } as const;

export default class Soundtrack {
    private readonly chart: Chart;
    private readonly synth: Synth;
    private readonly cues: Map<number, number>;
    private scheduledUntil = -Infinity;

    constructor(chart: Chart, storage: SoundStorage, synth?: Synth) {
        this.chart = chart;
        this.synth = synth ?? new Synth(storage);
        this.cues = buildCues(chart);
    }

    get muted(): boolean {
        return this.synth.muted;
    }

    // Call from every key or click handler: browsers only start audio after a gesture.
    unlock() {
        this.synth.unlock();
    }

    toggleMute(): boolean {
        this.synth.unlock();
        return this.synth.toggleMute();
    }

    dispose() {
        this.synth.dispose();
    }

    nowPlaying(phase: Phase): string {
        const piece = PIECES[phase];
        return `Now playing: ${piece.title}, ${piece.composer} (${piece.year})`;
    }

    // A new attempt (or a resume) starts scheduling the groove from `song`.
    restart(song: number) {
        this.scheduledUntil = song;
    }

    // Schedules the beats due in the next LOOKAHEAD_MS of song time.
    schedule(song: number) {
        if (!this.synth.isReady) return;
        const until = Math.min(song + LOOKAHEAD_MS, this.chart.end);
        const from = Math.max(this.scheduledUntil, song);
        if (until <= from) return;
        const origin = this.chart.phases[0]?.time ?? 0;
        for (const beat of beatsBetween(from, until, origin, BEAT_MS)) {
            const beatTime = origin + beat * BEAT_MS;
            for (const hit of grooveAt(this.phaseAt(beatTime), beat))
                this.synth.groove(
                    hit,
                    this.synth.at(beatTime + hit.offset * BEAT_MS - song),
                );
        }
        this.scheduledUntil = until;
    }

    countdown(value: string) {
        this.synth.countdown(value === "DEFEND!");
    }

    event(event: DefenseEvent) {
        switch (event.type) {
            case "hit": {
                const midi = this.cues.get(event.note.id);
                if (midi !== undefined)
                    this.synth.piano(midi, VELOCITY[event.judgment]);
                if (event.note.gold) this.synth.golden();
                break;
            }
            case "miss":
                this.synth.miss();
                break;
            case "stray":
                this.synth.stray();
                break;
            case "milestone":
                this.synth.milestone();
                break;
            case "eureka-start":
                this.synth.tramBell();
                break;
            case "phase":
                if (event.index > 0)
                    this.synth.phase(event.section.phase === "meltdown");
                break;
            case "failed":
                this.synth.sadTrombone();
                break;
            case "complete":
                this.synth.fanfare();
                break;
        }
    }

    stamp() {
        this.synth.stamp();
    }

    private phaseAt(time: number): Phase {
        let phase: Phase = this.chart.phases[0]?.section.phase ?? "opening";
        for (const mark of this.chart.phases)
            if (time >= mark.time) phase = mark.section.phase;
        return phase;
    }
}
