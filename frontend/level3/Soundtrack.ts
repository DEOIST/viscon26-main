// Turns the defense into sound: the level's music track, kept in sync with the song clock the
// chart is judged on (song time is track time), and the effects in Synth.ts for what happens
// on the page. Hits only tick, so the player hears the track, not a second melody over it.

import type { Chart, Phase } from "./chart";
import type { DefenseEvent } from "./engine";
import Synth from "./Synth";
import type { SoundStorage } from "./Synth";
import trackUrl from "./assets/music/thesis-defense.ogg";

const VELOCITY = { perfect: 1, great: 0.85, good: 0.65 } as const;
const FAIL_FADE_MS = 600;

type FetchTrack = () => Promise<ArrayBuffer>;

const fetchTrack: FetchTrack = () =>
    fetch(trackUrl).then((response) => {
        if (!response.ok) throw new Error(`Track ${response.status}`);
        return response.arrayBuffer();
    });

export default class Soundtrack {
    private readonly synth: Synth;
    private readonly data: Promise<ArrayBuffer | null>;
    private songZero: number | null = null; // performance.now() at song time 0, while playing
    private loading: Promise<void> | null = null;

    constructor(
        chart: Chart,
        storage: SoundStorage,
        synth?: Synth,
        fetcher: FetchTrack = fetchTrack,
    ) {
        void chart;
        this.synth = synth ?? new Synth(storage);
        // Downloading needs no gesture; decoding waits for the audio context.
        this.data = fetcher().catch(() => null);
    }

    get muted(): boolean {
        return this.synth.muted;
    }

    // Call from every key or click handler: browsers only start audio after a gesture.
    unlock(): Promise<void> {
        this.synth.unlock();
        if (!this.loading)
            this.loading = this.data.then(async (data) => {
                if (data && (await this.synth.loadTrack(data))) this.resync();
            });
        return this.loading;
    }

    toggleMute(): boolean {
        this.synth.unlock();
        return this.synth.toggleMute();
    }

    dispose() {
        this.songZero = null;
        this.synth.dispose();
    }

    nowPlaying(phase: Phase): string {
        void phase;
        return "Now playing: Thesis Defense, the original soundtrack.";
    }

    // The song clock reads `song` ms right now: play the track from there (or start it in the
    // future, during the countdown).
    play(song: number) {
        this.songZero = performance.now() - song;
        this.resync();
    }

    pause() {
        this.songZero = null;
        this.synth.stopTrack(0);
    }

    countdown(value: string) {
        this.synth.countdown(value === "DEFEND!");
    }

    event(event: DefenseEvent) {
        switch (event.type) {
            case "hit":
                this.synth.tick(VELOCITY[event.judgment]);
                if (event.note.gold) this.synth.golden();
                break;
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
                this.songZero = null;
                this.synth.stopTrack(FAIL_FADE_MS);
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

    // (Re)starts the track at the song clock's current position, if both are ready.
    private resync() {
        if (this.songZero === null || !this.synth.hasTrack) return;
        const song = performance.now() - this.songZero;
        this.synth.playTrack(Math.max(0, song), Math.max(0, -song));
    }
}
