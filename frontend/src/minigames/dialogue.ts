// Lines written for this player (POST /api/players/{id}/dialogue) for the games whose characters
// speak. Kept apart from DestinationGame so the shell can prefetch without loading game engines.
import { api } from "../api";
import { YEARS } from "../config";
import type { DialogueScene } from "../misc/CommonInt";
import { isYearUnlocked } from "../store";

// Shell slot → the scene whose lines that game speaks.
const DIALOGUE_SCENES: Record<string, DialogueScene> = {
    "year-2-slot": "blackjack", // the dealer
};
// How long a game waits for its lines before it starts with its own built-in ones.
export const DIALOGUE_WAIT_MS = 2500;

export function dialogueScene(slotId: string): DialogueScene | undefined {
    return DIALOGUE_SCENES[slotId];
}

/** The pack's lines, or null when the server fails or takes longer than DIALOGUE_WAIT_MS */
export function dialogueWithin(
    scene: DialogueScene,
): Promise<Record<string, string[]> | null> {
    return Promise.race([
        api.dialogue(scene).then(
            (pack) => pack.lines,
            () => null,
        ),
        new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), DIALOGUE_WAIT_MS),
        ),
    ]);
}

/** Ask for the lines of every unlocked talking game early, so they are ready at the table. */
export function prefetchDialogue(completedGameIds: string[]) {
    YEARS.forEach((year, index) => {
        if (!isYearUnlocked(index, completedGameIds)) return;
        for (const game of year.games) {
            const scene = DIALOGUE_SCENES[game.id];
            if (scene) api.dialogue(scene).catch(() => {});
        }
    });
}
