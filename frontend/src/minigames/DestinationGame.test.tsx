import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAMES } from "../config";
import { defaultPlayer } from "../store";
import type { MinigameOptions } from "../games/shared/minigame";
import DestinationGame from "./DestinationGame";

const { mount, destroy } = vi.hoisted(() => ({
    mount: vi.fn(),
    destroy: vi.fn(),
}));
vi.mock("../games/registry", () => ({
    MINIGAME_REGISTRY: { blackjack: mount, shooter: mount },
}));

const originalFlag = GAMES[0].implemented;
beforeEach(() => {
    mount.mockReset();
    destroy.mockReset();
    mount.mockReturnValue({ destroy });
});
afterEach(() => {
    cleanup();
    GAMES[0].implemented = originalFlag;
});

describe("independent destination minigame adapter", () => {
    it.each(["during mount", "after mount"])(
        "destroys an invalid game result immediately %s and keeps cleanup idempotent",
        (timing) => {
            const onComplete = vi.fn();
            const onExit = vi.fn();
            if (timing === "during mount")
                mount.mockImplementationOnce((options: MinigameOptions) => {
                    options.onFinish({ score: -1, stats: {} });
                    return { destroy };
                });
            const view = render(
                <DestinationGame
                    gameId="year-1-slot"
                    playerName="Ada"
                    character={defaultPlayer.character}
                    major="Computer Science"
                    ectsPoints={0}
                    completedGameIds={[]}
                    onComplete={onComplete}
                    onExit={onExit}
                />,
            );
            const options = mount.mock.calls[0][0] as MinigameOptions;
            if (timing === "after mount")
                act(() => options.onFinish({ score: 101, stats: {} }));
            expect(screen.getByRole("alert").textContent).toContain(
                "This minigame could not open.",
            );
            expect(destroy).toHaveBeenCalledOnce();
            options.onFinish({ score: 100, stats: {} });
            options.onExit();
            expect(onComplete).not.toHaveBeenCalled();
            expect(onExit).not.toHaveBeenCalled();
            view.unmount();
            expect(destroy).toHaveBeenCalledOnce();
        },
    );

    it("passes shared player state, translates IDs, and cleans up on exit", () => {
        const onComplete = vi.fn();
        const onExit = vi.fn();
        const view = render(
            <DestinationGame
                gameId="year-1-slot"
                playerName="Ada"
                character={defaultPlayer.character}
                major="Computer Science"
                ectsPoints={60}
                completedGameIds={["year-2-slot"]}
                onComplete={onComplete}
                onExit={onExit}
            />,
        );
        const options = mount.mock.calls[0][0] as MinigameOptions;
        expect(options).toMatchObject({
            gameId: "blackjack",
            playerName: "Ada",
            major: "D-INFK",
            ectsPoints: 60,
            completedGameIds: ["shooter"],
            character: {
                ...defaultPlayer.character,
                name: "Ada",
                department: "infk",
            },
        });
        options.onExit();
        expect(onExit).toHaveBeenCalledOnce();
        view.unmount();
        expect(destroy).toHaveBeenCalledOnce();
        options.onFinish({ score: 100, stats: {} });
        expect(onComplete).not.toHaveBeenCalled();
    });

    it("does not award preview credits, then completes implemented components once", () => {
        const onComplete = vi.fn();
        const onExit = vi.fn();
        GAMES[0].implemented = false;
        const args = {
            gameId: "year-1-slot",
            playerName: "Ada",
            character: defaultPlayer.character,
            major: "Computer Science",
            ectsPoints: 0,
            completedGameIds: [],
            onComplete,
            onExit,
        };
        const view = render(<DestinationGame {...args} />);
        const preview = mount.mock.calls[0][0] as MinigameOptions;
        preview.onFinish({ score: 100, stats: {} });
        expect(onComplete).not.toHaveBeenCalled();
        expect(onExit).toHaveBeenCalledOnce();
        view.unmount();
        GAMES[0].implemented = true;
        render(<DestinationGame {...args} />);
        const implemented = mount.mock.calls[1][0] as MinigameOptions;
        implemented.onFinish({ score: 100, stats: {} });
        implemented.onFinish({ score: 100, stats: {} });
        expect(onComplete).toHaveBeenCalledOnce();
    });
});
