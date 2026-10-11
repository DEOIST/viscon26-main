// Turns the defense into sound: the level's music track, kept in sync with the song clock the
// chart is judged on (song time is track time), and the effects in Synth.ts for what happens
// on the page. Hits only tick, so the player hears the track, not a second melody over it.

import type { Chart, Phase } from "./chart";
import { SYNC_DEADBAND_MS, SYNC_GAIN, SYNC_SNAP_MS } from "./config";
import type { DefenseEvent } from "./engine";
import Synth from "./Synth";
import type { SoundStorage } from "./Synth";
import trackM4a from "./assets/music/thesis-defense.m4a";
import trackOgg from "./assets/music/thesis-defense.ogg";
import { TRACK_CHART } from "./trackChart";
import { TEXT } from "../src/misc/text";

const VELOCITY = { perfect: 1, great: 0.85, good: 0.65 } as const;
const FAIL_FADE_MS = 600;
// The AAC copy (for Safari) starts with 2112 samples of encoder delay, flagged only in an
// iTunes tag. A decoder that keeps them plays everything 48 ms late; the decoded track is
// then that much longer than the file's music, which is how it is caught.
const AAC_PRIMING_MS = (2112 / 44100) * 1000;
const PADDING_TOLERANCE_MS = 30; // decoders may keep a few ms of tail padding; that's harmless

// How far to move the song clock towards the music it should follow, this frame.
export function clockCorrection(song: number, heard: number): number {
    const error = heard - song;
    if (Math.abs(error) < SYNC_DEADBAND_MS) return 0;
    if (Math.abs(error) > SYNC_SNAP_MS) return error;
    return error * SYNC_GAIN;
}

type FetchTrack = () => Promise<ArrayBuffer>;

const fetchFile =
    (url: string): FetchTrack =>
    () =>
        fetch(url).then((response) => {
            if (!response.ok) throw new Error(`Track ${response.status}`);
            return response.arrayBuffer();
        });

// The same track twice: Ogg Vorbis first, AAC for Safari, which cannot decode Ogg in Web
// Audio (it fails with "EncodingError: Decoding failed" even where canPlayType says yes).
const TRACK_FILES: FetchTrack[] = [fetchFile(trackOgg), fetchFile(trackM4a)];

export default class Soundtrack {
    private readonly synth: Synth;
    private readonly sources: FetchTrack[];
    private readonly first: Promise<ArrayBuffer | null>;
    private songZero: number | null = null; // performance.now() at song time 0, while playing
    private loading: Promise<void> | null = null;
    private leadMs = 0; // codec padding to skip at the start of the decoded track

    constructor(
        chart: Chart,
        storage: SoundStorage,
        synth?: Synth,
        sources: FetchTrack[] = TRACK_FILES,
        private readonly synthEvents = true,
        private readonly trackMs = TRACK_CHART.durationMs,
    ) {
        void chart;
        this.synth = synth ?? new Synth(storage);
        this.sources = sources;
        // Downloading needs no gesture; decoding waits for the audio context.
        this.first = sources[0]?.().catch(() => null) ?? Promise.resolve(null);
    }

    get muted(): boolean {
        return this.synth.muted;
    }

    // Call from every key or click handler: browsers only start audio after a gesture.
    unlock(): Promise<void> {
        this.synth.unlock();
        if (!this.loading) this.loading = this.load();
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
        return TEXT.thesisDefense.pane.nowPlaying;
    }

    // The song time being heard at `now` (performance.now()), or null when there is no music
    // to follow: muted tracks still count, a silent fallback or an unsupported browser doesn't.
    heardSongTime(now: number): number | null {
        if (this.songZero === null) return null;
        const heard = this.synth.heardTrackMs(now);
        return heard === null ? null : heard - this.leadMs;
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
        if (!this.synthEvents) return;
        this.synth.countdown(value === "DEFEND!");
    }

    event(event: DefenseEvent) {
        if (!this.synthEvents) {
            if (event.type === "failed") {
                this.songZero = null;
                this.synth.stopTrack(FAIL_FADE_MS);
            }
            return;
        }
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

    // Decodes the first file this browser can play; the defense runs silent if none works.
    private async load() {
        for (let i = 0; i < this.sources.length; i++) {
            const data =
                i === 0
                    ? await this.first
                    : await this.sources[i]().catch(() => null);
            if (data && (await this.synth.loadTrack(data))) {
                const extra = this.synth.trackDurationMs - this.trackMs;
                this.leadMs = extra > PADDING_TOLERANCE_MS ? AAC_PRIMING_MS : 0;
                this.resync();
                return;
            }
        }
    }

    // (Re)starts the track at the song clock's current position, if both are ready.
    private resync() {
        if (this.songZero === null || !this.synth.hasTrack) return;
        const song = performance.now() - this.songZero;
        this.synth.playTrack(
            Math.max(0, song) + this.leadMs,
            Math.max(0, -song),
        );
    }
}
