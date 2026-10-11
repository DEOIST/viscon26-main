import ShooterScene from "./ShooterScene";
import SwitchableInput from "./input/SwitchableInput";
import { ATHLETE_COOLDOWN_MS, GAMER_TARGET_SCALE } from "./config";
import { mountScene } from "../src/games/shared/createGame";
import type {
    MinigameHandle,
    MountMinigame,
} from "../src/games/shared/minigame";

// Level 1, the Basisprüfung finger-gun shooter (docs/SHOOTER_CV.md): the shell mounts it through
// src/games/registry.ts. Asks for the camera right away (the player just clicked Start), connects
// to the finger-detection engine (backend/level1/), and falls back to the mouse if either is
// unavailable.
export const mountShooter: MountMinigame = (options) => {
    const { archetype, name, skinColor } = options.character;
    const input = new SwitchableInput(
        options.parent,
        archetype === "athlete" ? ATHLETE_COOLDOWN_MS : null,
    );
    let handle: MinigameHandle;
    try {
        handle = mountScene(
            options,
            (finish) =>
                new ShooterScene({
                    playerName: name,
                    dialogue: options.dialogue,
                    input,
                    targetScale: archetype === "gamer" ? GAMER_TARGET_SCALE : 1,
                    skinColor,
                    finish,
                }),
        );
    } catch (error) {
        input.destroy(); // release the camera and the engine slot if Phaser can't start
        throw error;
    }
    return {
        destroy() {
            handle.destroy();
            input.destroy();
        },
    };
};
