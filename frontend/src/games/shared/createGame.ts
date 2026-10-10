// Phaser setup shared by every minigame. The only place that creates a Phaser.Game.

import { AUTO, Game, Scale } from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import type { Scene } from "phaser";
import type {
    MinigameHandle,
    MinigameOptions,
    MinigameResult,
} from "./minigame";

// Logical resolution (gameSize.ts); Phaser scales it to fit the container and letterboxes the
// rest. Re-exported so scenes keep importing it from here.
export { GAME_HEIGHT, GAME_WIDTH };

export function createGame(parent: HTMLElement, scene: Scene): Game {
    return new Game({
        type: AUTO, // WebGL, falling back to Canvas: never depend on WebGL-only effects
        parent,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        transparent: true, // the page shows through where a scene draws no background
        banner: false,
        scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
        scene,
    });
}

// Mounts one scene and enforces the MinigameHandle contract: `finish` reaches React exactly
// once, and `destroy()` can be called any number of times (StrictMode calls it in dev).
export function mountScene(
    options: MinigameOptions,
    makeScene: (finish: (result: MinigameResult) => void) => Scene,
): MinigameHandle {
    let isFinished = false;
    let isDestroyed = false;

    function finish(result: MinigameResult) {
        if (isFinished || isDestroyed) return;
        isFinished = true;
        options.onFinish(result);
    }

    const game = createGame(options.parent, makeScene(finish));
    return {
        destroy() {
            if (isDestroyed) return;
            isDestroyed = true;
            game.destroy(true); // true: also remove the canvas from the page
        },
    };
}
