import { lazy, Suspense, type ComponentType } from "react";
import type { MinigameProps } from "../types";
import { Icon } from "../components/Icon";
import { MultiLine } from "../components/MultiLine";
import { TEXT } from "../misc/text";

const T = TEXT.minigameHost;

const DestinationGame = lazy(() => import("./DestinationGame"));
function DestinationPreview(args: MinigameProps) {
    return (
        <Suspense
            fallback={
                <p className="host-notice" role="status">
                    {T.opening}
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
            <span className="eyebrow">{T.placeholder.eyebrow}</span>
            <h2>{T.placeholder.title}</h2>
            <p>
                <MultiLine text={T.placeholder.body} />
            </p>
            <button className="button secondary" onClick={onExit}>
                <Icon name="back" /> {TEXT.common.returnToOverview}
            </button>
        </div>
    );
}

/** Add an import and replace the relevant entry. No store access is needed. */
export const minigameRegistry: Record<string, ComponentType<MinigameProps>> = {
    "year-1-slot": DestinationPreview,
    "year-2-slot": DestinationPreview,
    "year-3-slot": DestinationPreview,
};
