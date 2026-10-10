// Adapts the independent destination mount contract without changing game code.
import { useEffect, useRef, useState } from "react";
import { GAMES, departmentLabel } from "../config";
import { MINIGAME_REGISTRY } from "../games/registry";
import type { MinigameHandle, MinigameId } from "../games/shared/minigame";
import type { MinigameProps } from "../types";
import { dialogueScene, dialogueWithin } from "./dialogue";

const DESTINATION_IDS: Record<string, MinigameId> = {
    "year-1-slot": "shooter", // level 1 (frontend/level1/)
    "year-2-slot": "blackjack",
    "year-3-slot": "thesis", // level 3 (frontend/level3/)
};

export default function DestinationGame(args: MinigameProps) {
    const parent = useRef<HTMLDivElement>(null);
    const callbacks = useRef(args);
    callbacks.current = args;
    const [failed, setFailed] = useState(false);
    const [waiting, setWaiting] = useState(false);
    useEffect(() => {
        const gameId = DESTINATION_IDS[args.gameId];
        const mount = MINIGAME_REGISTRY[gameId];
        let handle: MinigameHandle | undefined;
        let active = true;
        let finished = false;
        let destroyed = false;
        function destroyHandle() {
            active = false;
            if (!handle || destroyed) return;
            destroyed = true;
            try {
                handle.destroy();
            } catch {
                /* A supplied game must not trap the shell. */
            }
        }
        if (!mount) {
            setFailed(true);
            return;
        }
        const mountGame = mount;
        function start(dialogue: Record<string, string[]> | null) {
            try {
                handle = mountGame({
                    parent: parent.current!,
                    gameId,
                    playerName: args.playerName,
                    character: {
                        ...args.character,
                        name: args.playerName,
                        pronouns: "they",
                        department: "infk",
                        avatar: "a1",
                    },
                    major: departmentLabel(args.major),
                    ectsPoints: args.ectsPoints,
                    completedGameIds: args.completedGameIds.flatMap((id) =>
                        DESTINATION_IDS[id] ? [DESTINATION_IDS[id]] : [],
                    ),
                    dialogue,
                    onFinish(result) {
                        if (!active || finished) return;
                        if (
                            !Number.isInteger(result.score) ||
                            result.score < 0 ||
                            result.score > 100
                        ) {
                            destroyHandle();
                            setFailed(true);
                            return;
                        }
                        finished = true;
                        if (
                            GAMES.find((game) => game.id === args.gameId)
                                ?.implemented
                        )
                            callbacks.current.onComplete(result.score);
                        else callbacks.current.onExit();
                    },
                    onExit() {
                        if (active) callbacks.current.onExit();
                    },
                });
                // A mount may synchronously report an invalid result before returning its handle.
                if (!active) destroyHandle();
            } catch {
                destroyHandle();
                setFailed(true);
            }
        }
        const scene = dialogueScene(args.gameId);
        if (!scene) {
            setWaiting(false);
            start(null);
        } else {
            // A slow or failed AI never blocks the game: it starts with its built-in lines.
            setWaiting(true);
            void dialogueWithin(scene).then((lines) => {
                if (!active) return;
                setWaiting(false);
                start(lines);
            });
        }
        return destroyHandle;
    }, [
        args.gameId,
        args.playerName,
        args.character,
        args.major,
        args.ectsPoints,
        args.completedGameIds,
    ]);
    return failed ? (
        <div className="placeholder" role="alert">
            <h2>This minigame could not open.</h2>
            <button className="button secondary" onClick={args.onExit}>
                Return to games
            </button>
        </div>
    ) : (
        <>
            {waiting && (
                <p className="host-notice" role="status">
                    Shuffling the deck…
                </p>
            )}
            <div
                ref={parent}
                className="destination-game-mount"
                aria-label="Minigame play area"
            />
        </>
    );
}
