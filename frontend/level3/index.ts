import ThesisScene from "./ThesisScene";
import type { BestStorage } from "./verdict";
import { mountScene } from "../src/games/shared/createGame";
import type { MountMinigame } from "../src/games/shared/minigame";

// The PDF viewer's grey, so the letterbox around the canvas belongs to the game's world.
const VIEWER_GROUND = "#525659";

// The canvas says nothing to a screen reader, so phases and the verdict are also written into
// a visually hidden live region next to it.
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

// Storage that never throws: some browsers deny localStorage outright in private mode.
function bestStorage(): BestStorage {
    try {
        return window.localStorage;
    } catch {
        return { getItem: () => null, setItem: () => undefined };
    }
}

// Level 3, "Thesis defense" (docs/GAME_DESIGN.md): the Year 3 game, mounted by the shell
// through src/games/registry.ts. Keyboard only and no server side; its music and sounds are
// synthesised in the browser (Synth.ts), so it ships no audio files. F (or the toolbar
// button) puts the game's own container in fullscreen; the canvas refits to it.
export const mountThesisDefense: MountMinigame = (options) => {
    const parent = options.parent;
    const liveRegion = createLiveRegion();
    const previousBackground = parent.style.background;
    parent.style.background = VIEWER_GROUND;
    let scene: ThesisScene | null = null;

    const isFullscreen = () => document.fullscreenElement === parent;
    function toggleFullscreen() {
        if (isFullscreen())
            void document.exitFullscreen().catch(() => undefined);
        else if (parent.requestFullscreen)
            void parent
                .requestFullscreen({ navigationUI: "hide" })
                .catch(() => undefined); // denied (no gesture, iframe policy): play on in place
    }

    const game = mountScene(options, (finish) => {
        scene = new ThesisScene({
            playerName: options.playerName || options.character.name,
            storage: bestStorage(),
            finish,
            announce(text) {
                liveRegion.textContent = text;
            },
            toggleFullscreen,
            isFullscreen,
        });
        return scene;
    });
    parent.appendChild(liveRegion);
    return {
        destroy() {
            // Window listeners go first, even if Phaser never got to create() the scene.
            scene?.dispose();
            if (isFullscreen())
                void document.exitFullscreen().catch(() => undefined);
            game.destroy();
            liveRegion.remove();
            parent.style.background = previousBackground;
        },
    };
};
