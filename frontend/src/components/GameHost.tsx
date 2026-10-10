import {
    Component,
    type ComponentType,
    type ErrorInfo,
    type ReactNode,
} from "react";
import { minigameRegistry, Placeholder } from "../minigames/registry";
import type { Game, MinigameProps, Player } from "../types";
import { Icon } from "./Icon";

class GameBoundary extends Component<
    { children: ReactNode; onExit: () => void },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch(_error: Error, _info: ErrorInfo) {
        /* Keep the shell usable if a supplied game fails. */
    }
    render() {
        return this.state.failed ? (
            <div className="placeholder" role="alert">
                <h2>This minigame could not open.</h2>
                <p>
                    Your saved progress is safe. Return to the overview and try
                    again.
                </p>
                <button
                    className="button secondary"
                    onClick={this.props.onExit}
                >
                    Return to overview
                </button>
            </div>
        ) : (
            this.props.children
        );
    }
}
export function GameHost({
    game,
    player,
    ects,
    completedGameIds,
    busy,
    error,
    onComplete,
    onExit,
    registry = minigameRegistry,
    compact = false,
}: {
    game: Game;
    player: Player;
    ects: number;
    completedGameIds: string[];
    busy: boolean;
    error: string;
    onComplete: () => void;
    onExit: () => void;
    registry?: Record<string, ComponentType<MinigameProps>>;
    compact?: boolean;
}) {
    const GameComponent = registry[game.id] || Placeholder;
    return (
        <section
            className={compact ? "game-host compact-host" : "game-host panel"}
            aria-label={game.title}
        >
            {!compact && (
                <div className="host-toolbar">
                    <div>
                        <span className="eyebrow">
                            {game.implemented
                                ? "MINIGAME"
                                : "PLACEHOLDER PREVIEW"}
                        </span>
                        <h2 id="host-title">{game.title}</h2>
                    </div>
                    <button
                        className="button ghost compact"
                        onClick={onExit}
                        disabled={busy}
                    >
                        <Icon name="back" size={16} /> Overview
                    </button>
                </div>
            )}
            {busy && (
                <p className="host-notice" role="status">
                    Saving completion…
                </p>
            )}
            {error && (
                <div className="error-box" role="alert">
                    {error}
                    {game.implemented && (
                        <button
                            className="button secondary compact"
                            disabled={busy}
                            onClick={onComplete}
                        >
                            Retry saving
                        </button>
                    )}
                </div>
            )}
            <GameBoundary key={game.id} onExit={onExit}>
                <GameComponent
                    gameId={game.id}
                    playerName={player.name}
                    character={player.character}
                    major={player.major}
                    ectsPoints={ects}
                    completedGameIds={completedGameIds}
                    onComplete={onComplete}
                    onExit={onExit}
                />
            </GameBoundary>
        </section>
    );
}
