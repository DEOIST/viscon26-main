import BlackjackScene from "./BlackjackScene";
import { mountScene } from "../src/games/shared/createGame";
import type { MountMinigame } from "../src/games/shared/minigame";
import { attachFullscreen } from "../src/games/shared/fullscreen";
import { TEXT } from "../src/misc/text";

// The felt's darkest edge, so a fullscreen letterbox looks like more table.
const FELT_EDGE = "#06361c";

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
                dialogue: options.dialogue,
                finish,
                announce(text) {
                    liveRegion.textContent = text;
                },
            }),
    );
    options.parent.appendChild(liveRegion);
    // F or the corner button: the table fills the screen for a projector or a big audience.
    const fullscreen = attachFullscreen(options.parent, {
        labels: TEXT.blackjack.fullscreen,
        background: FELT_EDGE,
    });
    return {
        destroy() {
            fullscreen.dispose();
            game.destroy();
            liveRegion.remove();
        },
    };
};
