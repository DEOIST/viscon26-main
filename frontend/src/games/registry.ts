// Register supplied mount functions here, then enable their shared metadata.
// Empty until the independently developed minigames land; previews never award credits.
import type { GameId } from "../misc/CommonInt";
import type { MountMinigame } from "./shared/minigame";

export const MINIGAME_REGISTRY: Partial<Record<GameId, MountMinigame>> = {};
