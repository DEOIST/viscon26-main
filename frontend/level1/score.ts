// Shooter scoring (docs/GAME_DESIGN.md): points per shot and the 0–100 score sent to the server.

import {
    MISS_PENALTY,
    PAR_POINTS,
    STREAK_BONUS,
    STREAK_FOR_BONUS,
    TARGET_POINTS,
    type TargetKind,
} from "./config";

// Points for one shot. `kind` is the target hit (null: a miss); `streakBefore` is how many hits
// in a row came before it, so the third hit in a row earns the first bonus.
export function shotPoints(
    kind: TargetKind | null,
    streakBefore: number,
): number {
    if (kind === null) return -MISS_PENALTY;
    const bonus = streakBefore + 1 >= STREAK_FOR_BONUS ? STREAK_BONUS : 0;
    return TARGET_POINTS[kind] + bonus;
}

// The round's running total after a gain or a penalty. It never drops below zero: early
// mistakes would otherwise dig a hole the rest of the round has to climb out of first, and a
// round with real catches could still end at 0 points, 0 score and 0 ECTS.
export function addPoints(total: number, delta: number): number {
    return Math.max(0, total + delta);
}

// Rounded half up and clamped to 0–100.
export function shooterScore(points: number): number {
    const score = Math.floor((100 * points) / PAR_POINTS + 0.5);
    return Math.min(100, Math.max(0, score));
}
