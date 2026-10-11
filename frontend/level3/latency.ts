// The player's own timing offset. The song clock already follows what the speakers play
// (Soundtrack.clockCorrection), but some delay is invisible to the browser: keyboard and
// screen lag, and Bluetooth headphones that don't report theirs. Every hit records how early
// or late it was, so a run's hits show the player's lean; tuning shifts later key presses by
// it, and the timing meter centres on the beat they hear. Kept in this browser only.

import {
    CALIBRATION_MAX_MS,
    CALIBRATION_MIN_HITS,
    CALIBRATION_MIN_MS,
    OFFSET_KEY,
} from "./config";
import type { BestStorage } from "./verdict";

function clampOffset(ms: number): number {
    return Math.max(
        -CALIBRATION_MAX_MS,
        Math.min(CALIBRATION_MAX_MS, Math.round(ms)),
    );
}

export function median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function loadOffset(storage: BestStorage): number {
    try {
        const value = Number(storage.getItem(OFFSET_KEY));
        return Number.isFinite(value) ? clampOffset(value) : 0;
    } catch {
        return 0; // storage disabled: play untuned
    }
}

export function saveOffset(storage: BestStorage, ms: number) {
    try {
        storage.setItem(OFFSET_KEY, String(clampOffset(ms)));
    } catch {
        // Storage denied: the tuning still holds for this visit.
    }
}

export interface TimingLean {
    lean: number; // median ms of this run's hits: positive is late
    suggested: number; // the offset that would centre them
}

// How a run's hits lean, given the offset they were judged with; null when there's too little
// to go on or the lean is within what players do on their own.
export function suggestOffset(
    deltas: readonly number[],
    current: number,
): TimingLean | null {
    if (deltas.length < CALIBRATION_MIN_HITS) return null;
    const lean = median(deltas);
    if (Math.abs(lean) < CALIBRATION_MIN_MS) return null;
    const suggested = clampOffset(current + lean);
    return suggested === current ? null : { lean: Math.round(lean), suggested };
}
