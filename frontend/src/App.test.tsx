import { Provider } from "react-redux";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api } from "./api";
import { GAMES, TOTAL_ECTS } from "./config";
import {
    defaultPlayer,
    emptyProgress,
    readGuest,
    replacePlayer,
    replaceProgress,
    store,
} from "./store";
import type { Progress } from "./types";

// Exercise the complete curriculum without enabling unfinished production games.
vi.mock("./config", async (importOriginal) => {
    const original = await importOriginal<typeof import("./config")>();
    const years = original.YEARS.map((year) => ({
        ...year,
        games: year.games.map((game) => ({ ...game, implemented: true })),
    }));
    return {
        ...original,
        YEARS: years,
        GAMES: years.flatMap((year) => year.games),
    };
});

vi.mock("./api", () => ({
    api: { synchronize: vi.fn(), scoreboard: vi.fn(), config: vi.fn() },
    errorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Request failed",
}));

// Keep the test at the game-shell seam; minigames have independent contracts.
vi.mock("./components/GameWorkspace", () => ({
    default: function Workspace(args: {
        eligible: boolean;
        graduationPreview: boolean;
        onGraduate: () => void;
    }) {
        return (
            <button
                disabled={!args.eligible && !args.graduationPreview}
                onClick={args.onGraduate}
            >
                {!args.eligible && args.graduationPreview
                    ? "Preview graduation"
                    : "Graduate"}
            </button>
        );
    },
}));

beforeEach(() => {
    localStorage.clear();
    store.dispatch(replacePlayer(defaultPlayer));
    store.dispatch(replaceProgress(emptyProgress));
    vi.mocked(api.synchronize).mockReset();
    vi.mocked(api.config)
        .mockReset()
        .mockResolvedValue({ graduationPreview: false });
    vi.mocked(api.scoreboard).mockReset().mockResolvedValue([]);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
    }));
    Object.defineProperties(HTMLDialogElement.prototype, {
        showModal: {
            configurable: true,
            value: function (this: HTMLDialogElement) {
                this.setAttribute("open", "");
            },
        },
        close: {
            configurable: true,
            value: function (this: HTMLDialogElement) {
                this.removeAttribute("open");
            },
        },
    });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function saveCompletedRun(graduated: boolean): Progress {
    const progress = {
        completedGameIds: GAMES.map((game) => game.id),
        graduated,
        ...(graduated ? { graduatedAt: "2026-10-10T12:00:00.000Z" } : {}),
    };
    localStorage.setItem(
        "eth-simulator.guest.v1",
        JSON.stringify({
            version: 1,
            player: {
                ...defaultPlayer,
                name: "Ada",
                onboardingStage: "main",
            },
            progress,
        }),
    );
    const saved = readGuest();
    store.dispatch(replacePlayer(saved.player));
    store.dispatch(replaceProgress(saved.progress));
    return saved.progress;
}

function renderApp() {
    return render(
        <Provider store={store}>
            <App />
        </Provider>,
    );
}

it("restores a named character builder without sending an unfinished profile to the server", () => {
    store.dispatch(
        replacePlayer({
            ...defaultPlayer,
            name: "Ada",
            onboardingStage: "builder",
        }),
    );
    renderApp();
    expect(
        screen.getByRole("textbox", { name: "Character name" }),
    ).toHaveProperty("value", "Ada");
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(api.synchronize).not.toHaveBeenCalled();
    expect(
        screen.queryByRole("button", { name: /log in|register/i }),
    ).toBeNull();
});

it("keeps graduation locked when the environment preview flag is off", async () => {
    store.dispatch(
        replacePlayer({
            ...defaultPlayer,
            name: "Ada",
            onboardingStage: "main",
        }),
    );
    vi.mocked(api.synchronize).mockResolvedValue(emptyProgress);
    renderApp();
    await waitFor(() => expect(api.config).toHaveBeenCalledOnce());
    expect(
        screen
            .getByRole("button", { name: "Graduate" })
            .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
});

it("previews the diploma with unfinished results without graduating or submitting extra requests", async () => {
    store.dispatch(
        replacePlayer({
            ...defaultPlayer,
            name: "Ada",
            onboardingStage: "main",
        }),
    );
    vi.mocked(api.config).mockResolvedValue({ graduationPreview: true });
    vi.mocked(api.synchronize).mockResolvedValue(emptyProgress);
    renderApp();
    const preview = await screen.findByRole("button", {
        name: "Preview graduation",
    });
    await waitFor(() =>
        expect(store.getState().progress.graduatedAt).toBeNull(),
    );
    const before = store.getState();
    fireEvent.click(preview);
    const diploma = within(await screen.findByRole("dialog"));
    expect(diploma.getByText("0 ECTS")).toBeTruthy();
    expect(diploma.getByText(/test preview/i)).toBeTruthy();
    expect(store.getState()).toEqual(before);
    expect(api.synchronize).toHaveBeenCalledOnce(); // Only normal startup reconciliation.
    fireEvent.click(
        diploma.getByRole("button", { name: "Back to graduation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "View diploma" }));
    expect(store.getState()).toEqual(before);
    expect(api.synchronize).toHaveBeenCalledOnce();
});

it("graduates offline, preserves the completed run, and retries submission without blocking the diploma", async () => {
    const completed = saveCompletedRun(false);
    vi.mocked(api.synchronize).mockRejectedValue(new Error("Server offline"));
    renderApp();
    await screen.findByText("Leaderboard sync: Server offline");
    expect(api.synchronize).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Graduate" }));
    const diploma = within(await screen.findByRole("dialog"));
    expect(
        diploma.getByRole("heading", { name: "Congratulations, Ada!" }),
    ).toBeTruthy();
    expect(diploma.getByText(`${TOTAL_ECTS} ECTS`)).toBeTruthy();
    await diploma.findByText("Server offline");
    expect(api.synchronize).toHaveBeenCalledTimes(2);
    const graduated = store.getState().progress;
    expect(graduated.graduated).toBe(true);
    expect(graduated.completedGameIds).toEqual(completed.completedGameIds);
    expect(Number.isFinite(Date.parse(graduated.graduatedAt!))).toBe(true);

    fireEvent.click(
        diploma.getByRole("button", { name: "Back to graduation" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
        screen.getByRole("heading", { name: "You did it, Ada." }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View diploma" }));
    expect(api.synchronize).toHaveBeenCalledTimes(2);
    expect(store.getState().progress).toEqual(graduated);

    vi.mocked(api.synchronize).mockResolvedValue(graduated);
    fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
            name: "Retry leaderboard update",
        }),
    );
    await waitFor(() => {
        expect(
            within(screen.getByRole("dialog")).queryByText("Server offline"),
        ).toBeNull();
    });
    expect(api.synchronize).toHaveBeenCalledTimes(3);
    expect(vi.mocked(api.synchronize).mock.calls[2][0].progress).toEqual(
        graduated,
    );
    expect(store.getState().progress).toEqual(graduated);
    expect(
        within(screen.getByRole("dialog")).getByText(`${TOTAL_ECTS} ECTS`),
    ).toBeTruthy();
});

it("restores an existing local graduation on refresh and reopens its diploma without extra submissions", async () => {
    const graduated = saveCompletedRun(true);
    vi.mocked(api.synchronize).mockRejectedValue(new Error("Server offline"));
    const first = renderApp();
    expect(
        within(screen.getByRole("dialog")).getByText(`${TOTAL_ECTS} ECTS`),
    ).toBeTruthy();
    await within(screen.getByRole("dialog")).findByText("Server offline");
    expect(api.synchronize).toHaveBeenCalledOnce();
    first.unmount();

    const reloaded = readGuest();
    expect(reloaded.progress).toEqual(graduated);
    store.dispatch(replacePlayer(reloaded.player));
    store.dispatch(replaceProgress(reloaded.progress));
    vi.mocked(api.synchronize).mockClear();
    renderApp();
    const diploma = within(screen.getByRole("dialog"));
    expect(
        diploma.getByRole("heading", { name: "Congratulations, Ada!" }),
    ).toBeTruthy();
    expect(diploma.getByText(`${TOTAL_ECTS} ECTS`)).toBeTruthy();
    expect(screen.getByRole("dialog").querySelector("time")?.dateTime).toBe(
        graduated.graduatedAt,
    );
    await diploma.findByText("Server offline");
    expect(api.synchronize).toHaveBeenCalledOnce();
    expect(vi.mocked(api.synchronize).mock.calls[0][0].progress).toEqual(
        graduated,
    );

    fireEvent.click(
        diploma.getByRole("button", { name: "Back to graduation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "View diploma" }));
    expect(api.synchronize).toHaveBeenCalledOnce();
    expect(store.getState().progress).toEqual(graduated);
});
