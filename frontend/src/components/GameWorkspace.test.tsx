import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GameWorkspace from "./GameWorkspace";
import { teaseFor } from "./LectureResult";
import { GAMES, YEARS } from "../config";
import { defaultPlayer } from "../store";

vi.mock("./GameHost", () => ({
    GameHost: () => <button>Game control</button>,
}));

const originalFlag = GAMES[0].implemented;
afterEach(() => {
    cleanup();
    GAMES[0].implemented = originalFlag;
});

function setup(
    selected = false,
    graduationPreview = false,
    completedGameIds: string[] = [],
) {
    const onOpen = vi.fn();
    const onEditCharacter = vi.fn();
    const onGraduate = vi.fn();
    const view = render(
        <GameWorkspace
            player={{ ...defaultPlayer, name: "Ada" }}
            progress={{
                completedGameIds,
                scores: Object.fromEntries(
                    completedGameIds.map((id) => [id, 0]),
                ),
                graduated: false,
            }}
            ects={0}
            eligible={GAMES.every((game) => completedGameIds.includes(game.id))}
            graduationPreview={graduationPreview}
            busy={false}
            error=""
            selectedGame={selected ? GAMES[0] : null}
            onOpen={onOpen}
            onComplete={vi.fn()}
            onExit={vi.fn()}
            onGraduate={onGraduate}
            onScoreboard={vi.fn()}
            onEditCharacter={onEditCharacter}
        />,
    );
    return { view, onOpen, onEditCharacter, onGraduate };
}

it("counts remaining minigames even when completed games earn no ECTS", () => {
    const { view } = setup(false, false, [GAMES[0].id]);
    expect(screen.getByText("Minigames to graduation: 2")).toBeTruthy();
    expect(
        screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true); // Year 2 opens next, and its game isn't finished yet

    view.unmount();
    setup(
        false,
        false,
        GAMES.map((game) => game.id),
    );
    expect(
        screen.getByText("All years complete. Your diploma is ready."),
    ).toBeTruthy();
    expect(
        screen
            .getByRole("button", { name: "Graduate" })
            .hasAttribute("disabled"),
    ).toBe(false);
});

it("allows a flagged graduation preview while keeping the button unavailable during a game", () => {
    const { view, onGraduate } = setup(false, true);
    expect(
        screen.queryByRole("button", { name: "Preview graduation" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: YEARS[2].title }));
    fireEvent.click(screen.getByRole("button", { name: "Preview graduation" }));
    expect(onGraduate).toHaveBeenCalledOnce();
    view.unmount();
    setup(true, true);
    expect(
        screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
});

it("opens the character builder from the profile picture, but not mid-game", () => {
    const { onEditCharacter, view } = setup();
    const portraits = screen.getAllByRole("button", { name: "Edit character" });
    fireEvent.click(portraits[0]);
    expect(onEditCharacter).toHaveBeenCalledOnce();

    view.unmount();
    setup(true);
    for (const portrait of screen.getAllByRole("button", {
        name: "Edit character",
    }))
        expect(portrait.hasAttribute("disabled")).toBe(true);
});

it("browses locked years with keyboard and selectors without allowing launch", () => {
    GAMES[0].implemented = true; // Year 1 is launchable; later years remain locked
    const { onOpen } = setup();
    fireEvent.keyDown(screen.getByRole("region", { name: "Active game" }), {
        key: "ArrowRight",
    });
    expect(screen.getByRole("heading", { name: GAMES[1].title })).toBeTruthy();
    expect(
        screen.getByRole("button", { name: "Locked" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Locked" }));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: YEARS[2].title }));
    expect(screen.getByRole("heading", { name: GAMES[2].title })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("region", { name: "Active game" }), {
        key: "Home",
    });
    fireEvent.click(screen.getByRole("button", { name: "Start lecture" })); // Year 1: Bug Bash
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(GAMES[0]);
    expect(
        screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
});

it("shows the browsed year's photo behind the workspace, earlier years parked to the left", () => {
    const { view } = setup();
    const layers = () =>
        [...document.querySelectorAll("body > [aria-hidden=true] > img")].map(
            (image) => image.className,
        );
    expect(layers()).toHaveLength(YEARS.length);
    expect(layers()[0]).toMatch(/currentYear/);
    fireEvent.click(screen.getByRole("button", { name: YEARS[1].title }));
    expect(layers()[0]).toMatch(/pastYear/);
    expect(layers()[1]).toMatch(/currentYear/);
    expect(layers()[2]).toBe("");
    view.unmount();
    expect(layers()).toHaveLength(0);
});

it("leaves game keyboard input alone and prevents carousel switching during a round", () => {
    setup(true);
    const control = screen.getByRole("button", { name: "Game control" });
    const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
    });
    fireEvent(control, event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole("heading", { name: GAMES[0].title })).toBeTruthy();
    expect(
        screen
            .getByRole("button", { name: "Next game" })
            .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Overview" })).toBeTruthy();
});

it("explains each year's game in three steps before it launches", () => {
    const onOpen = vi.fn();
    render(
        <GameWorkspace
            player={{ ...defaultPlayer, name: "Ada" }}
            progress={{
                completedGameIds: ["year-1-slot"],
                scores: {},
                graduated: false,
            }}
            ects={60}
            eligible={false}
            busy={false}
            error=""
            selectedGame={null}
            onOpen={onOpen}
            onComplete={vi.fn()}
            onExit={vi.fn()}
            onGraduate={vi.fn()}
            onScoreboard={vi.fn()}
            onEditCharacter={vi.fn()}
        />,
    );
    const howTo = screen.getByRole("region", { name: "How to play" });
    expect(howTo.querySelectorAll("li")).toHaveLength(3);
    expect(howTo.querySelectorAll("img")).toHaveLength(3);
    expect(within(howTo).getByText("Beat the curve")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start lecture" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(GAMES[1]);

    cleanup();
    setup(); // a fresh degree opens on Year 1, not played yet
    const bugBash = screen.getByRole("region", { name: "How to play" });
    expect(within(bugBash).getAllByRole("img")).toHaveLength(3);
    expect(within(bugBash).getByText("Grab bugs")).toBeTruthy();

    cleanup();
    setup(false, false, [GAMES[0].id, GAMES[1].id]); // opens on Year 3
    const thesis = screen.getByRole("region", { name: "How to play" });
    expect(within(thesis).getAllByRole("img")).toHaveLength(3);
    expect(within(thesis).getByText("Hit the references")).toBeTruthy();
});

it("shows the ECTS a finished game paid and moves on to the next year", () => {
    setup(false, false, [GAMES[0].id]);
    fireEvent.click(screen.getByRole("button", { name: YEARS[0].title }));
    // setup() records every finished game with a score of 0: it paid nothing.
    const meter = screen.getByRole("meter", {
        name: "ECTS earned in this game",
    });
    expect(meter.getAttribute("aria-valuenow")).toBe("0");
    expect(within(meter).getByText(`0 / ${GAMES[0].ects} ECTS`)).toBeTruthy();

    const next = screen.getByRole("button", { name: "Next" });
    expect(next.hasAttribute("disabled")).toBe(false);
    fireEvent.click(next);
    expect(screen.getByRole("heading", { name: GAMES[1].title })).toBeTruthy();
    expect(screen.queryByRole("meter")).toBeNull(); // Year 2 isn't played yet
});

it("shows a played lecture's result instead of its how-to, with a retry", () => {
    const { onOpen } = setup(false, false, [GAMES[0].id]);
    fireEvent.click(screen.getByRole("button", { name: YEARS[0].title }));
    expect(screen.queryByRole("region", { name: "How to play" })).toBeNull();
    const result = screen.getByRole("meter", {
        name: "Your result for this lecture",
    });
    expect(result.getAttribute("aria-valuenow")).toBe("0");
    expect(result.getAttribute("aria-valuemax")).toBe(String(GAMES[0].ects));
    expect(within(result).getByText("Score 0 %")).toBeTruthy();
    expect(within(result).getByText(teaseFor(0))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry lecture" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(GAMES[0]);
});

it("teases each score band with its own line", () => {
    const lines = [0, 10, 30, 50, 70, 80, 95].map(teaseFor);
    expect(new Set(lines).size).toBe(lines.length);
    expect(teaseFor(100)).toBe(teaseFor(95));
});

it("graduates from the last year only and opens there once everything is done", () => {
    setup(
        false,
        false,
        GAMES.map((game) => game.id),
    );
    expect(screen.getByRole("heading", { name: GAMES[2].title })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(
        screen
            .getByRole("button", { name: "Graduate" })
            .hasAttribute("disabled"),
    ).toBe(false);
});
