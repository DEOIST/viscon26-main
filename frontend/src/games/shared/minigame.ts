// The one seam between the React outer shell and a game engine (docs/ARCHITECTURE.md →
// "The minigame contract"). Pages only ever call a MountMinigame; games never fetch, never
// navigate and never import React.

import type { Character, GameId } from "../../misc/CommonInt";

// Games the account shell can mount. Level 3 lives only in the year shell, so it has no
// legacy run score and is not a contract GameId (CommonInt.ts / schemas.py).
export type MinigameId = GameId | "thesis";

export interface MinigameResult {
    score: number; // 0–100, normalized by the game
    stats: Record<string, number>; // for the result screen, e.g. { bankroll: 1350 }
}

export interface MinigameOptions {
    parent: HTMLElement; // container element owned by React
    character: Character; // perks and flavor
    gameId: MinigameId;
    playerName: string;
    major: string;
    ectsPoints: number;
    completedGameIds: MinigameId[];
    onExit(): void;
    dialogue: Record<string, string[]> | null; // prefetched lines by event key, or null
    onFinish(result: MinigameResult): void; // called exactly once
}

export interface MinigameHandle {
    destroy(): void; // idempotent: stops loops, input and camera, removes the canvas
}

export type MountMinigame = (options: MinigameOptions) => MinigameHandle;

// A random line for a dialogue event, never the same one twice in a row; `fallback` when the
// pack has no lines for that event.
export function pickLine(
    dialogue: Record<string, string[]> | null,
    event: string,
    fallback: string,
    previous?: string,
): string {
    const lines = dialogue?.[event]?.filter((line) => line !== previous) ?? [];
    if (lines.length === 0) return dialogue?.[event]?.[0] ?? fallback;
    return lines[Math.floor(Math.random() * lines.length)];
}
