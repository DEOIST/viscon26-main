// What flies at the player, and how often (docs/GAME_DESIGN.md → Targets). Pure, unit-tested.

import {
    SPAWN_EVERY_MS_END,
    SPAWN_EVERY_MS_START,
    SPAWN_SHARES,
    type TargetKind,
} from "./config";

const KINDS = Object.keys(SPAWN_SHARES) as TargetKind[];

// `roll` is a random number in [0, 1); each kind gets its share of that range, in order.
export function pickTargetKind(roll: number): TargetKind {
    let upTo = 0;
    for (const kind of KINDS) {
        upTo += SPAWN_SHARES[kind];
        if (roll < upTo) return kind;
    }
    return KINDS[KINDS.length - 1];
}

// The spawn interval shrinks linearly over the round (`progress` 0..1) and then stays put.
export function spawnIntervalMs(progress: number): number {
    const clamped = Math.min(1, Math.max(0, progress));
    return (
        SPAWN_EVERY_MS_START +
        (SPAWN_EVERY_MS_END - SPAWN_EVERY_MS_START) * clamped
    );
}
