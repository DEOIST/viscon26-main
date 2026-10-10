import { describe, expect, it } from "vitest";
import { BAR_MS, DEFENSE_CHART } from "./chart";
import {
    PIECES,
    beatsBetween,
    buildCues,
    grooveAt,
    midiToHz,
    noteToMidi,
} from "./music";

describe("pitch helpers", () => {
    it("reads note names and tunes A4 to 440 Hz", () => {
        expect(noteToMidi("A4")).toBe(69);
        expect(noteToMidi("C4")).toBe(60);
        expect(noteToMidi("F#5")).toBe(78);
        expect(noteToMidi("Bb3")).toBe(58);
        expect(midiToHz(69)).toBeCloseTo(440);
        expect(midiToHz(81)).toBeCloseTo(880);
    });

    it("rejects malformed note names", () => {
        expect(() => noteToMidi("H2")).toThrow();
        expect(() => noteToMidi("C")).toThrow();
    });
});

describe("the pieces", () => {
    it("are public-domain classics, one per phase, all in a playable range", () => {
        for (const piece of Object.values(PIECES)) {
            expect(piece.year).toBeLessThan(1900);
            expect(piece.melody.length).toBeGreaterThan(16);
            for (const midi of piece.melody) {
                expect(midi).toBeGreaterThanOrEqual(55);
                expect(midi).toBeLessThanOrEqual(90);
            }
            expect(piece.bass.length).toBeGreaterThan(0);
        }
    });
});

describe("buildCues (piano-tiles style)", () => {
    const cues = buildCues(DEFENSE_CHART);

    it("gives every note of the chart a pitch", () => {
        expect(cues.size).toBe(DEFENSE_CHART.notes.length);
    });

    it("walks the phase's melody one step at a time", () => {
        const opening = DEFENSE_CHART.notes.filter(
            (note) => note.time < DEFENSE_CHART.phases[1].time,
        );
        const steps = [...new Set(opening.map((note) => note.time))];
        const first = opening.find((note) => note.time === steps[0])!;
        const second = opening.find((note) => note.time === steps[1])!;
        expect(cues.get(first.id)).toBe(PIECES.opening.melody[0]);
        expect(cues.get(second.id)).toBe(PIECES.opening.melody[1]);
    });

    it("voices chords as consonant stacks under the melody note", () => {
        const byTime = new Map<number, number[]>();
        for (const note of DEFENSE_CHART.notes)
            byTime.set(note.time, [
                ...(byTime.get(note.time) ?? []),
                cues.get(note.id)!,
            ]);
        for (const pitches of byTime.values()) {
            const top = Math.max(...pitches);
            for (const pitch of pitches)
                expect([0, 5, 12, 17]).toContain(top - pitch);
            expect(new Set(pitches).size).toBe(pitches.length);
        }
    });
});

describe("groove", () => {
    it("lists the beats inside a window", () => {
        const beat = BAR_MS / 4;
        expect(beatsBetween(0, beat * 2.5, 0, beat)).toEqual([0, 1, 2]);
        expect(beatsBetween(beat * 0.5, beat * 1.5, 0, beat)).toEqual([1]);
        expect(beatsBetween(-beat, -1, 0, beat)).toEqual([-1]);
    });

    it("keeps the hall quiet before the defense and pulses during it", () => {
        expect(grooveAt("opening", -1)).toEqual([]);
        const downbeat = grooveAt("opening", 0);
        expect(downbeat.some((hit) => hit.kind === "bass")).toBe(true);
        expect(downbeat.some((hit) => hit.kind === "kick")).toBe(true);
        const meltdown = grooveAt("meltdown", 1);
        expect(meltdown.some((hit) => hit.kind === "snare")).toBe(true);
    });
});
