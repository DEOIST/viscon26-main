// The only caller of game mount functions; each effect owns exactly one game's lifetime.
import { useEffect, useRef, useState } from "react";
import { DEPARTMENTS } from "../../misc/character";
import type { Run, ShellGame } from "../../misc/CommonInt";
import type {
    MinigameHandle,
    MinigameResult,
    MountMinigame,
} from "../../games/shared/minigame";
import { shellClass } from "../../misc/shellStyles";

interface MinigameHostArgs {
    mount: MountMinigame;
    run: Run;
    game: ShellGame;
    onFinish(result: MinigameResult): void;
    onExit(): void;
}
export default function MinigameHost(args: MinigameHostArgs) {
    const parent = useRef<HTMLDivElement>(null);
    const callbacks = useRef(args);
    callbacks.current = args;
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let active = true;
        let finished = false;
        let handle: MinigameHandle | undefined;
        setFailed(false);
        try {
            handle = args.mount({
                parent: parent.current!,
                character: args.run.character,
                gameId: args.game.id,
                playerName: args.run.character.name,
                major: DEPARTMENTS[args.run.character.department],
                ectsPoints: args.run.ectsPoints,
                completedGameIds: [...args.run.completedGameIds],
                dialogue: null,
                onFinish(result) {
                    if (!active || finished) return;
                    if (
                        !Number.isInteger(result.score) ||
                        result.score < 0 ||
                        result.score > 100
                    ) {
                        setFailed(true);
                        return;
                    }
                    finished = true;
                    callbacks.current.onFinish(result);
                },
                onExit() {
                    if (active) callbacks.current.onExit();
                },
            });
        } catch {
            setFailed(true);
        }
        return () => {
            active = false;
            try {
                handle?.destroy();
            } catch {
                /* A broken game must not trap the shell. */
            }
        };
    }, [args.mount, args.run, args.game]);
    return (
        <>
            <div
                ref={parent}
                className={shellClass("game-mount")}
                hidden={failed}
            />
            {failed && (
                <div className={shellClass("placeholder")} role="alert">
                    <h2>This minigame could not open.</h2>
                    <p>
                        Your saved progress is safe. Return to campus and try
                        again.
                    </p>
                    <button
                        className={shellClass("button secondary")}
                        onClick={args.onExit}
                    >
                        Return to campus
                    </button>
                </div>
            )}
        </>
    );
}
