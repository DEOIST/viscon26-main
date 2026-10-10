import BlackjackScene from "./BlackjackScene";
import { mountScene } from "../shared/createGame";
import type { MountMinigame } from "../shared/minigame";

export const mountBlackjack: MountMinigame = (options) =>
    mountScene(
        options,
        (finish) =>
            new BlackjackScene({
                playerName: options.character.name,
                dialogue: options.dialogue,
                finish,
            }),
    );
