import {
    Component,
    type ComponentType,
    type ErrorInfo,
    type ReactNode,
} from "react";
import { minigameRegistry, Placeholder } from "../minigames/registry";
import type { Game, MinigameProps, Player } from "../types";
import { Icon } from "./Icon";
import { TEXT } from "../misc/text";

const T = TEXT.minigameHost;

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
                <h2>{T.failedTitle}</h2>
                <p>{T.failedHelp}</p>
                <button
                    className="button secondary"
                    onClick={this.props.onExit}
                >
                    {TEXT.common.returnToOverview}
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
    onComplete: (score?: number) => void; // no score: retry saving
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
                                ? T.eyebrow
                                : T.placeholderEyebrow}
                        </span>
                        <h2 id="host-title">{game.title}</h2>
                    </div>
                    <button
                        className="button ghost compact"
                        onClick={onExit}
                        disabled={busy}
                    >
                        <Icon name="back" size={16} /> {TEXT.common.overview}
                    </button>
                </div>
            )}
            {busy && (
                <p className="host-notice" role="status">
                    {T.savingCompletion}
                </p>
            )}
            {error && (
                <div className="error-box" role="alert">
                    {error}
                    {game.implemented && (
                        <button
                            className="button secondary compact"
                            disabled={busy}
                            onClick={() => onComplete()}
                        >
                            {T.retrySaving}
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
