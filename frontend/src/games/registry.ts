// Destination scenes use the shell seam. Shared metadata controls credit eligibility.
import { mountBlackjack } from "../../level2";
import { mountShooter } from "../../level1";
import { mountThesisDefense } from "../../level3";
import type { MinigameId, MountMinigame } from "./shared/minigame";

export const MINIGAME_REGISTRY: Partial<Record<MinigameId, MountMinigame>> = {
    blackjack: mountBlackjack,
    shooter: mountShooter,
    thesis: mountThesisDefense, // level 3 (frontend/level3/)
};
