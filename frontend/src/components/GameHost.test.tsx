import { useState } from "react";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GAMES } from "../config";
import { defaultPlayer } from "../store";
import type { MinigameProps } from "../types";
import { GameHost } from "./GameHost";

afterEach(cleanup);

it("retries a failed save without requiring a finished game to call back twice", async () => {
    const save = vi
        .fn()
        .mockRejectedValueOnce(new Error("Save unavailable"))
        .mockResolvedValueOnce(undefined);
    function SingleFinishGame(args: MinigameProps) {
        const [finished, setFinished] = useState(false);
        return finished ? (
            <p>Round finished</p>
        ) : (
            <button
                onClick={() => {
                    setFinished(true);
                    args.onComplete(80);
                }}
            >
                Finish round
            </button>
        );
    }
    function Harness() {
        const [error, setError] = useState("");
        const [saved, setSaved] = useState(false);
        async function complete() {
            try {
                await save();
                setSaved(true);
            } catch (err) {
                setError((err as Error).message);
            }
        }
        return saved ? (
            <p>Completion saved</p>
        ) : (
            <GameHost
                game={{ ...GAMES[0], implemented: true }}
                player={defaultPlayer}
                ects={0}
                completedGameIds={[]}
                busy={false}
                error={error}
                onComplete={() => void complete()}
                onExit={vi.fn()}
                registry={{ [GAMES[0].id]: SingleFinishGame }}
                compact
            />
        );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Finish round" }));
    await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain(
            "Save unavailable",
        ),
    );
    expect(screen.queryByRole("button", { name: "Finish round" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
    await waitFor(() =>
        expect(screen.getByText("Completion saved")).toBeTruthy(),
    );
    expect(save).toHaveBeenCalledTimes(2);
});
