import { lazy, Suspense, type ComponentType } from "react";
import type { MinigameProps } from "../types";
import { Icon } from "../components/Icon";

const DestinationGame = lazy(() => import("./DestinationGame"));
function DestinationPreview(args: MinigameProps) {
    return (
        <Suspense
            fallback={
                <p className="host-notice" role="status">
                    Opening minigame…
                </p>
            }
        >
            <DestinationGame {...args} />
        </Suspense>
    );
}

export function Placeholder({ onExit }: MinigameProps) {
    return (
        <div className="placeholder">
            <span className="placeholder-icon">
                <Icon name="slot" size={42} />
            </span>
            <span className="eyebrow">A LITTLE ROOM FOR WHAT’S NEXT</span>
            <h2>Minigame component will be connected here</h2>
            <p>
                This is a preview slot. There’s nothing to play yet,
                <br />
                and no ECTS are awarded here.
            </p>
            <button className="button secondary" onClick={onExit}>
                <Icon name="back" /> Return to overview
            </button>
        </div>
    );
}

/** Add an import and replace the relevant entry. No store access is needed. */
export const minigameRegistry: Record<string, ComponentType<MinigameProps>> = {
    "year-1-slot": DestinationPreview,
    "year-2-slot": DestinationPreview,
    "year-3-slot": Placeholder,
};
