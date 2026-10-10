// Destination scenes use the shell seam. Shared metadata controls credit eligibility.
import type { GameId } from "../misc/CommonInt";
import { mountBlackjack } from "./blackjack";
import { mountShooter } from "./shooter";
import type { MountMinigame } from "./shared/minigame";

export const MINIGAME_REGISTRY: Partial<Record<GameId, MountMinigame>> = {
    blackjack: mountBlackjack,
    shooter: mountShooter,
};
