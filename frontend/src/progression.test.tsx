import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameHost } from "./components/GameHost";
import { GAMES, TOTAL_ECTS, YEARS } from "./config";
import {
    completeGame,
    createAppStore,
    defaultPlayer,
    isYearComplete,
    isYearUnlocked,
    markGraduated,
    readGuest,
    selectCanGraduate,
    selectEcts,
} from "./store";
import type { MinigameProps } from "./types";

const originalFlags = GAMES.map((game) => game.implemented);
beforeEach(() => {
    GAMES.forEach((game) => {
        game.implemented = true;
    });
    localStorage.clear();
});
afterEach(() => {
    GAMES.forEach((game, index) => {
        game.implemented = originalFlags[index];
    });
    cleanup();
});

describe("degree progression", () => {
    it("unlocks each year only after all previous games are complete", () => {
        const store = createAppStore();
        expect(isYearUnlocked(0, [])).toBe(true);
        expect(isYearUnlocked(1, [])).toBe(false);
        store.dispatch(completeGame(GAMES[1].id));
        expect(store.getState().progress.completedGameIds).toEqual([]);
        store.dispatch(completeGame(GAMES[0].id));
        expect(
            isYearUnlocked(1, store.getState().progress.completedGameIds),
        ).toBe(true);
        expect(
            isYearUnlocked(2, store.getState().progress.completedGameIds),
        ).toBe(false);
    });

    it("awards configured ECTS once and guards graduation", () => {
        const store = createAppStore();
        store.dispatch(markGraduated());
        expect(store.getState().progress.graduated).toBe(false);
        store.dispatch(completeGame(GAMES[0].id));
        store.dispatch(completeGame(GAMES[0].id));
        expect(selectEcts(store.getState())).toBe(YEARS[0].ects);
        expect(store.getState().progress.completedGameIds).toHaveLength(1);
        expect(selectCanGraduate(store.getState())).toBe(false);
        GAMES.slice(1).forEach((game) => store.dispatch(completeGame(game.id)));
        expect(selectEcts(store.getState())).toBe(TOTAL_ECTS);
        expect(selectCanGraduate(store.getState())).toBe(true);
        store.dispatch(markGraduated());
        expect(store.getState().progress.graduated).toBe(true);
    });

    it("supports several games in a year without unlocking early", () => {
        const year = {
            ...YEARS[0],
            games: [
                ...YEARS[0].games,
                {
                    id: "second-slot",
                    title: "Another game",
                    ects: 30,
                    implemented: true,
                },
            ],
        };
        expect(isYearComplete(year, [GAMES[0].id])).toBe(false);
        expect(isYearComplete(year, [GAMES[0].id, "second-slot"])).toBe(true);
    });

    it("rejects placeholder and unknown completions", () => {
        const store = createAppStore();
        GAMES[0].implemented = false;
        store.dispatch(completeGame(GAMES[0].id));
        store.dispatch(completeGame("made-up-game"));
        expect(selectEcts(store.getState())).toBe(0);
        expect(store.getState().progress.completedGameIds).toEqual([]);
    });

    it("validates versioned guest records and removes out-of-order completions", () => {
        localStorage.setItem(
            "eth-simulator.guest.v1",
            JSON.stringify({
                version: 1,
                player: {
                    ...defaultPlayer,
                    name: " Ada ",
                    onboardingStage: "main",
                },
                progress: { completedGameIds: [GAMES[2].id], graduated: true },
            }),
        );
        expect(readGuest().player.name).toBe("Ada");
        expect(readGuest().progress).toEqual({
            completedGameIds: [],
            graduated: false,
        });
        localStorage.setItem("eth-simulator.guest.v1", "{invalid");
        expect(readGuest().player.onboardingStage).toBe("welcome");
    });
});

it("hosts independent test components that report completion through props", () => {
    const store = createAppStore();
    const calls: MinigameProps[] = [];
    function TestComponent(props: MinigameProps) {
        calls.push(props);
        return (
            <button onClick={props.onComplete}>Finish test component</button>
        );
    }
    const onExit = vi.fn();
    const view = render(
        <Provider store={store}>
            <GameHost
                game={GAMES[0]}
                player={{ ...defaultPlayer, name: "Ada" }}
                ects={0}
                completedGameIds={[]}
                busy={false}
                error=""
                onExit={onExit}
                onComplete={() => store.dispatch(completeGame(GAMES[0].id))}
                registry={{ [GAMES[0].id]: TestComponent }}
            />
        </Provider>,
    );
    fireEvent.click(
        screen.getByRole("button", { name: "Finish test component" }),
    );
    fireEvent.click(
        screen.getByRole("button", { name: "Finish test component" }),
    );
    expect(selectEcts(store.getState())).toBe(YEARS[0].ects);
    expect(calls[0]).toMatchObject({
        gameId: GAMES[0].id,
        playerName: "Ada",
        major: "Computer Science",
        ectsPoints: 0,
        completedGameIds: [],
    });
    act(() => calls[0].onExit());
    expect(onExit).toHaveBeenCalledOnce();
    view.unmount();
});
