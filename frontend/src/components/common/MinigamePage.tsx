import { useRef, useState, type ReactNode } from "react";
import ShellLayout from "./ShellLayout";
import RunStatus from "./RunStatus";
import MinigameHost from "./MinigameHost";
import Icon from "./Icon";
import { MINIGAME_REGISTRY } from "../../games/registry";
import { apiGenerateDialogue, apiSubmitScore } from "../../misc/apiClient";
import { GAMES } from "../../misc/shellConfig";
import { useRun } from "../../misc/useRun";
import { runHref } from "../../misc/run";
import type { GameId } from "../../misc/CommonInt";
import type { MinigameResult } from "../../games/shared/minigame";
import { shellClass } from "../../misc/shellStyles";

interface MinigamePageArgs {
    gameId: GameId;
    introExtra?: ReactNode; // e.g. the shooter's camera and engine status
}
export default function MinigamePage(args: MinigamePageArgs) {
    const state = useRun();
    const game = GAMES.find((game) => game.id === args.gameId)!;
    const mount = MINIGAME_REGISTRY[game.id];
    const [result, setResult] = useState<MinigameResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [started, setStarted] = useState(false);
    const [dialogue, setDialogue] = useState<Record<string, string[]> | null>(
        null,
    );
    const saving = useRef(false);
    async function handleStart() {
        if (!state.data || saving.current) return;
        saving.current = true;
        setBusy(true);
        const response = await apiGenerateDialogue(state.data.id, {
            scene: game.id,
        });
        setDialogue(response.data?.lines ?? null);
        setStarted(true);
        saving.current = false;
        setBusy(false);
    }
    function handleExit() {
        if (state.data && !saving.current)
            window.location.href = runHref("/campus", state.data.id);
    }
    async function handleSave(completion: MinigameResult) {
        if (!state.data || saving.current || !mount) return;
        if (!game.implemented) {
            setResult(completion);
            return;
        }
        saving.current = true;
        setBusy(true);
        setError("");
        setResult(completion);
        const saved = await apiSubmitScore(state.data.id, {
            game: game.id,
            score: completion.score,
        });
        if (saved.data)
            window.location.href = runHref("/campus", state.data.id);
        else {
            setError(saved.error || "Your result could not be saved.");
            saving.current = false;
            setBusy(false);
        }
    }
    return (
        <ShellLayout title={game.title}>
            <RunStatus
                loading={state.loading}
                error={state.error}
                onRetry={state.reload}
            >
                {state.data && (
                    <section
                        className={shellClass("game-host panel")}
                        aria-labelledby="host-title"
                    >
                        <div className={shellClass("host-toolbar")}>
                            <div>
                                <span className={shellClass("eyebrow")}>
                                    {game.implemented && mount
                                        ? "MINIGAME"
                                        : "PREVIEW"}
                                </span>
                                <h1 id="host-title">{game.title}</h1>
                            </div>
                            <button
                                className={shellClass("button ghost compact")}
                                disabled={busy}
                                onClick={handleExit}
                            >
                                <Icon name="back" size={16} />
                                Campus
                            </button>
                        </div>
                        {!mount ? (
                            <div className={shellClass("placeholder")}>
                                <Icon name="slot" size={40} />
                                <h2>A little space for a big challenge.</h2>
                                <p>{game.description}</p>
                                <p>
                                    This minigame is coming later. Previews do
                                    not change your scores or ECTS.
                                </p>
                                <button
                                    className={shellClass("button secondary")}
                                    onClick={handleExit}
                                >
                                    Return to campus
                                </button>
                            </div>
                        ) : !started ? (
                            <div className={shellClass("placeholder")}>
                                <p>{game.description}</p>
                                {args.introExtra}
                                {!game.implemented && (
                                    <p>
                                        This is a preview. Results do not change
                                        your scores or ECTS.
                                    </p>
                                )}
                                <button
                                    className={shellClass("button primary")}
                                    disabled={busy}
                                    onClick={() => void handleStart()}
                                >
                                    {busy
                                        ? "Getting ready…"
                                        : game.implemented
                                          ? "Start"
                                          : "Start preview"}
                                </button>
                            </div>
                        ) : result ? (
                            <div className={shellClass("placeholder")}>
                                <h2>Your result: {result.score} / 100</h2>
                                {!game.implemented && (
                                    <p>
                                        Preview complete. Your saved scores and
                                        ECTS are unchanged.
                                    </p>
                                )}
                                {busy && (
                                    <p role="status">Saving completion…</p>
                                )}
                                {error && (
                                    <>
                                        <p
                                            className={shellClass("error-box")}
                                            role="alert"
                                        >
                                            {error}
                                        </p>
                                        <button
                                            className={shellClass(
                                                "button primary",
                                            )}
                                            onClick={() =>
                                                void handleSave(result)
                                            }
                                        >
                                            Retry save
                                        </button>
                                        <p>
                                            Returning without retrying leaves
                                            this result unsaved.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <MinigameHost
                                mount={mount}
                                run={state.data}
                                game={game}
                                dialogue={dialogue}
                                onFinish={(completion) =>
                                    void handleSave(completion)
                                }
                                onExit={handleExit}
                            />
                        )}
                    </section>
                )}
            </RunStatus>
        </ShellLayout>
    );
}
