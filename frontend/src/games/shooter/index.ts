import ShooterScene from "./ShooterScene";
import SwitchableInput from "./input/SwitchableInput";
import { ATHLETE_COOLDOWN_MS, GAMER_TARGET_SCALE } from "./config";
import { mountScene } from "../shared/createGame";
import type { MountMinigame } from "../shared/minigame";

// Asks for the camera right away (the player just clicked Start), connects to the
// finger-detection engine, and falls back to the mouse if either is unavailable.
export const mountShooter: MountMinigame = (options) => {
    const { archetype, name } = options.character;
    const input = new SwitchableInput(
        options.parent,
        archetype === "athlete" ? ATHLETE_COOLDOWN_MS : null,
    );
    const handle = mountScene(
        options,
        (finish) =>
            new ShooterScene({
                playerName: name,
                dialogue: options.dialogue,
                input,
                targetScale: archetype === "gamer" ? GAMER_TARGET_SCALE : 1,
                finish,
            }),
    );
    return {
        destroy() {
            handle.destroy();
            input.destroy();
        },
    };
};
