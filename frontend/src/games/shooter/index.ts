import ShooterScene from "./ShooterScene";
import { mountScene } from "../shared/createGame";
import type { MountMinigame } from "../shared/minigame";

export const mountShooter: MountMinigame = (options) =>
    mountScene(
        options,
        (finish) =>
            new ShooterScene({
                playerName: options.character.name,
                dialogue: options.dialogue,
                finish,
            }),
    );
