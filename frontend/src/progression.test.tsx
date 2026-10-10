import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameHost } from "./components/GameHost";
import { GAMES, TOTAL_ECTS, YEARS, endingFor } from "./config";
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
        store.dispatch(completeGame({ gameId: GAMES[1].id, score: 100 }));
        expect(store.getState().progress.completedGameIds).toEqual([]);
        store.dispatch(completeGame({ gameId: GAMES[0].id, score: 100 }));
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
        store.dispatch(completeGame({ gameId: GAMES[0].id, score: 100 }));
        store.dispatch(completeGame({ gameId: GAMES[0].id, score: 100 }));
        expect(selectEcts(store.getState())).toBe(YEARS[0].ects);
        expect(store.getState().progress.completedGameIds).toHaveLength(1);
        expect(selectCanGraduate(store.getState())).toBe(false);
        GAMES.slice(1).forEach((game) =>
            store.dispatch(completeGame({ gameId: game.id, score: 100 })),
        );
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

    it("pays ECTS by score and graduates once every year is finished", () => {
        const store = createAppStore();
        const scores = [50, 33, 0];
        GAMES.forEach((game, index) =>
            store.dispatch(
                completeGame({ gameId: game.id, score: scores[index] }),
            ),
        );
        // 60 × 50 % + 60 × 33 % (19.8, rounded half up) + 0
        expect(selectEcts(store.getState())).toBe(50);
        expect(selectCanGraduate(store.getState())).toBe(true);
        store.dispatch(completeGame({ gameId: GAMES[0].id, score: 100 }));
        expect(selectEcts(store.getState())).toBe(50);
    });

    it("rejects scores outside 0–100", () => {
        const store = createAppStore();
        for (const score of [-1, 101, 49.5, Number.NaN])
            store.dispatch(completeGame({ gameId: GAMES[0].id, score }));
        expect(store.getState().progress.completedGameIds).toEqual([]);
    });

    it("picks the career from the share of the degree", () => {
        const at = (ects: number) => endingFor(ects).id;
        expect(at(TOTAL_ECTS)).toBe("quant");
        expect(at(153)).toBe("quant"); // 85 %
        expect(at(152)).toBe("phd");
        expect(at(117)).toBe("phd"); // 65 %
        expect(at(116)).toBe("masters");
        expect(at(81)).toBe("masters"); // 45 %
        expect(at(80)).toBe("mcdonalds");
        expect(at(45)).toBe("mcdonalds"); // 25 %
        expect(at(44)).toBe("homeless");
        expect(at(0)).toBe("homeless");
    });

    it("keeps saved scores and pays older saves without one in full", () => {
        localStorage.setItem(
            "eth-simulator.guest.v1",
            JSON.stringify({
                version: 1,
                player: {
                    ...defaultPlayer,
                    name: "Ada",
                    onboardingStage: "main",
                },
                progress: {
                    completedGameIds: [GAMES[0].id, GAMES[1].id],
                    scores: { [GAMES[0].id]: 40, [GAMES[1].id]: 500 },
                    graduated: false,
                },
            }),
        );
        const saved = readGuest();
        expect(saved.progress.scores).toEqual({ [GAMES[0].id]: 40 });
        expect(
            createAppStore(saved).getState().progress.completedGameIds,
        ).toHaveLength(2);
        expect(selectEcts(createAppStore(saved).getState())).toBe(24 + 60);
    });

    it("rejects placeholder and unknown completions", () => {
        const store = createAppStore();
        GAMES[0].implemented = false;
        store.dispatch(completeGame({ gameId: GAMES[0].id, score: 100 }));
        store.dispatch(completeGame({ gameId: "made-up-game", score: 100 }));
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
            scores: {},
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
            <button onClick={() => props.onComplete(100)}>
                Finish test component
            </button>
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
                onComplete={() =>
                    store.dispatch(
                        completeGame({ gameId: GAMES[0].id, score: 100 }),
                    )
                }
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
