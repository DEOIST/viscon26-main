import { useEffect, useState, type ReactNode } from "react";
import MinigameHost from "./MinigameHost";
import MissingRun from "./MissingRun";
import {
    apiGenerateDialogue,
    apiGetRunById,
    apiSubmitScore,
} from "../../misc/apiClient";
import { runHref } from "../../misc/run";
import { useApi } from "../../misc/useApi";
import type {
    MinigameResult,
    MountMinigame,
} from "../../games/shared/minigame";
import type { GameId } from "../../misc/CommonInt";
import styles from "./MinigamePage.module.css";

interface MinigamePageArgs {
    runId: string;
    game: GameId;
    title: string;
    instructions: string;
    introExtra?: ReactNode; // e.g. the shooter's camera and engine status
    mount: MountMinigame;
}

type Phase = "intro" | "playing" | "saving" | "saveFailed";

// The React outer shell of every minigame: instructions → the round (MinigameHost) → save the
// score → back to campus. It never leaves the page with an unsaved score: it offers Retry.
export default function MinigamePage(args: MinigamePageArgs) {
    const run = useApi(() => apiGetRunById(args.runId), [args.runId]);
    // Prefetched while the player reads the instructions, so the round never waits for the AI.
    const dialogue = useApi(
        () => apiGenerateDialogue(args.runId, { scene: args.game }),
        [args.runId, args.game],
    );
    const [phase, setPhase] = useState<Phase>("intro");
    const [roundDialogue, setRoundDialogue] = useState<Record<
        string,
        string[]
    > | null>(null);
    const [result, setResult] = useState<MinigameResult | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (run.data?.ending)
            window.location.replace(runHref("/graduation", args.runId));
    }, [run.data, args.runId]);

    async function saveScore(finished: MinigameResult) {
        setPhase("saving");
        const res = await apiSubmitScore(args.runId, {
            game: args.game,
            score: Math.round(finished.score),
        });
        if (res.error !== null) {
            setSaveError(res.error);
            setPhase("saveFailed");
            return;
        }
        window.location.href = runHref("/campus", args.runId);
    }

    function handleStart() {
        // Frozen for the whole round: a new dialogue object would remount the game.
        setRoundDialogue(dialogue.data?.lines ?? null);
        setPhase("playing");
    }

    function handleFinish(finished: MinigameResult) {
        setResult(finished);
        void saveScore(finished);
    }

    function handleRetry() {
        if (result !== null) void saveScore(result);
    }

    if (run.error !== null) return <MissingRun error={run.error} />;
    if (run.data === null) return <p className={styles.muted}>Loading…</p>;

    return (
        <section className={styles.page}>
            <h1 className={styles.title}>{args.title}</h1>
            {phase === "intro" && (
                <div className={styles.panel}>
                    <p>{args.instructions}</p>
                    {args.introExtra}
                    <button
                        className={styles.primary}
                        onClick={handleStart}
                        disabled={dialogue.loading}
                    >
                        {dialogue.loading ? "Getting ready…" : "Start"}
                    </button>
                </div>
            )}
            {phase === "playing" && (
                <MinigameHost
                    mount={args.mount}
                    character={run.data.character}
                    dialogue={roundDialogue}
                    onFinish={handleFinish}
                />
            )}
            {phase === "saving" && (
                <p className={styles.panel}>
                    Score {result?.score}. Saving your result…
                </p>
            )}
            {phase === "saveFailed" && (
                <div className={styles.panel}>
                    <p className={styles.error}>
                        Your score ({result?.score}) isn't saved yet:{" "}
                        {saveError}
                    </p>
                    <button className={styles.primary} onClick={handleRetry}>
                        Retry
                    </button>
                </div>
            )}
            <a href={runHref("/campus", args.runId)}>Back to campus</a>
        </section>
    );
}
