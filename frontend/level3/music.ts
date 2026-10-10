// The defense's music, as data. Every piece is a public-domain classic, played by our own
// synth (Synth.ts), so there is no recording and nothing copyrighted to ship.
//
// It plays like Piano Tiles: each step of the chart owns the next note of its phase's
// melody, and the player performs the tune by hitting the notes. A miss leaves a hole in the
// melody. Underneath, a quiet groove (kick, hats, bass) keeps the beat that the music would
// otherwise give.

import type { Chart, Phase } from "./chart";

export interface Piece {
    title: string;
    composer: string;
    year: number;
    melody: number[]; // MIDI notes, one per chart step, looped
    bass: number[]; // MIDI roots, one per bar, looped
}

const NOTE_INDEX: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
};

export function noteToMidi(name: string): number {
    const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!match) throw new Error(`Bad note name "${name}"`);
    const [, letter, accidental, octave] = match;
    const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
    return 12 * (Number(octave) + 1) + NOTE_INDEX[letter] + shift;
}

export function midiToHz(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
}

const notes = (text: string) => text.trim().split(/\s+/).map(noteToMidi);

export const PIECES: Record<Phase, Piece> = {
    // Prof. Lemma's ringtone.
    opening: {
        title: "Minuet in G",
        composer: "C. Petzold (Bach's notebook)",
        year: 1725,
        melody: notes(`
            D5 G4 A4 B4 C5 D5 G4 G4 E5 C5 D5 E5 F#5 G5 G4 G4
            C5 D5 C5 B4 A4 B4 C5 B4 A4 G4 F#4 G4 A4 B4 G4 B4 A4
            D5 G4 A4 B4 C5 D5 G4 G4 E5 C5 D5 E5 F#5 G5 G4 G4
            C5 D5 C5 B4 A4 B4 C5 B4 A4 G4 A4 B4 A4 G4 F#4 G4`),
        bass: notes("G3 D3 G3 C3 D3 G3 D3 G3"),
    },
    cross: {
        title: "Eine kleine Nachtmusik",
        composer: "W. A. Mozart",
        year: 1787,
        melody: notes(`
            G4 D4 G4 D4 G4 D4 G4 B4 D5
            C5 A4 C5 A4 C5 A4 F#4 A4 D4
            G4 G4 B4 A4 G4 G4 F#4 F#4 A4 C5 F#4 A4 G4 G4 B4 A4
            G4 D5 C5 B4 A4 G4 F#4 G4`).map((midi) => midi + 12),
        bass: notes("G2 D3 G2 D3"),
    },
    // Prof. Gradient diverges to the most panicked tune in the public domain.
    meltdown: {
        title: "In the Hall of the Mountain King",
        composer: "E. Grieg",
        year: 1875,
        melody: notes(`
            B4 C#5 D5 E5 F#5 D5 F#5 F5 C#5 F5 E5 C5 E5
            B4 C#5 D5 E5 F#5 D5 F#5 B5 A5 F#5 D5 F#5 A5
            B4 C#5 D5 E5 F#5 D5 F#5 F5 C#5 F5 E5 C5 E5
            B4 C#5 D5 E5 F#5 D5 F#5 B5 A5 F#5 D5 F#5 B5`),
        bass: notes("B2 B2 F#2 B2"),
    },
    final: {
        title: "Ode to Joy",
        composer: "L. van Beethoven",
        year: 1824,
        melody: notes(`
            F#5 F#5 G5 A5 A5 G5 F#5 E5 D5 D5 E5 F#5 F#5 E5 E5
            F#5 F#5 G5 A5 A5 G5 F#5 E5 D5 D5 E5 F#5 E5 D5 D5
            E5 E5 F#5 D5 E5 F#5 G5 F#5 D5 E5 F#5 G5 F#5 E5 D5 E5 A4
            F#5 F#5 G5 A5 A5 G5 F#5 E5 D5 D5 E5 F#5 E5 D5 D5`),
        bass: notes("D3 A2 D3 A2 D3 G2 A2 D3"),
    },
};

// Chord voices under the melody note: octaves and fifths, consonant in any key.
const CHORD_DROPS = [0, 5, 12, 17];

// Note id → MIDI pitch. Steps count per phase, so each phase starts its tune from the top.
export function buildCues(chart: Chart): Map<number, number> {
    const cues = new Map<number, number>();
    const phaseOf = (time: number) => {
        let phase = chart.phases[0]?.section.phase ?? "opening";
        for (const mark of chart.phases)
            if (time >= mark.time) phase = mark.section.phase;
        return phase;
    };
    const stepIndex: Partial<Record<Phase, number>> = {};
    let lastTime = NaN;
    let voice = 0;
    let melodyNote = 0;
    // Notes of a chord share a time and come in lane order: the lowest lane sings the melody.
    for (const note of chart.notes) {
        if (note.time !== lastTime) {
            const phase = phaseOf(note.time);
            const index = stepIndex[phase] ?? 0;
            stepIndex[phase] = index + 1;
            const melody = PIECES[phase].melody;
            melodyNote = melody[index % melody.length];
            lastTime = note.time;
            voice = 0;
        }
        cues.set(note.id, melodyNote - CHORD_DROPS[voice % CHORD_DROPS.length]);
        voice += 1;
    }
    return cues;
}

// --- Groove ------------------------------------------------------------------

export type DrumKind = "kick" | "snare" | "hat" | "bass";

export interface GrooveHit {
    kind: DrumKind;
    offset: number; // fraction of a beat after the beat itself
    gain: number; // 0–1
    midi?: number; // bass only
}

// Beat indices (relative to `origin`) whose time falls inside [from, to).
export function beatsBetween(
    from: number,
    to: number,
    origin: number,
    beatMs: number,
): number[] {
    const beats: number[] = [];
    for (let k = Math.ceil((from - origin) / beatMs); ; k++) {
        if (origin + k * beatMs >= to) break;
        beats.push(k);
    }
    return beats;
}

// What the band plays on one beat of a phase. Intensity follows the story: a soft pulse for
// the opening, backbeat snares for the meltdown, four on the floor for the final defense.
export function grooveAt(phase: Phase, beat: number): GrooveHit[] {
    if (beat < 0) return [];
    const inBar = beat % 4;
    const bar = Math.floor(beat / 4);
    const bass = PIECES[phase].bass;
    const hits: GrooveHit[] = [
        { kind: "hat", offset: 0, gain: inBar === 0 ? 0.5 : 0.3 },
        { kind: "hat", offset: 0.5, gain: 0.18 },
    ];
    const fourOnFloor = phase === "final";
    if (inBar === 0 || inBar === 2 || fourOnFloor)
        hits.push({ kind: "kick", offset: 0, gain: inBar === 0 ? 1 : 0.7 });
    if (inBar === 0 || inBar === 2)
        hits.push({
            kind: "bass",
            offset: 0,
            gain: 0.8,
            midi: bass[bar % bass.length],
        });
    if ((phase === "meltdown" || phase === "final") && inBar % 2 === 1)
        hits.push({ kind: "snare", offset: 0, gain: 0.6 });
    if (phase === "meltdown")
        hits.push(
            { kind: "hat", offset: 0.25, gain: 0.12 },
            { kind: "hat", offset: 0.75, gain: 0.12 },
        );
    return hits;
}
