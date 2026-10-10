import BlackjackScene from "./BlackjackScene";
import { mountScene } from "../src/games/shared/createGame";
import type { MountMinigame } from "../src/games/shared/minigame";

// The canvas says nothing to a screen reader, so the table's state is also written into a
// visually hidden live region next to it.
function createLiveRegion(): HTMLElement {
    const region = document.createElement("p");
    region.setAttribute("aria-live", "polite");
    Object.assign(region.style, {
        position: "absolute",
        width: "1px",
        height: "1px",
        margin: "-1px",
        overflow: "hidden",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
    });
    return region;
}

// Level 2, Galton Blackjack ("Casino night", docs/GAME_DESIGN.md): the shell mounts it through
// src/games/registry.ts. Its server side, the dealer's dialogue, lives in backend/level2/.
export const mountBlackjack: MountMinigame = (options) => {
    const liveRegion = createLiveRegion();
    const game = mountScene(
        options,
        (finish) =>
            new BlackjackScene({
                playerName: options.character.name,
                look: options.character,
                dialogue: options.dialogue,
                finish,
                announce(text) {
                    liveRegion.textContent = text;
                },
            }),
    );
    options.parent.appendChild(liveRegion);
    return {
        destroy() {
            game.destroy();
            liveRegion.remove();
        },
    };
};
