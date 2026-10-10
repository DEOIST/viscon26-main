import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GameWorkspace from "./GameWorkspace";
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

function setup(selected = false) {
    const onOpen = vi.fn();
    const onEditCharacter = vi.fn();
    const view = render(
        <GameWorkspace
            player={{ ...defaultPlayer, name: "Ada" }}
            progress={{ completedGameIds: [], graduated: false }}
            ects={0}
            eligible={false}
            authenticated={false}
            busy={false}
            error=""
            selectedGame={selected ? GAMES[0] : null}
            onOpen={onOpen}
            onComplete={vi.fn()}
            onExit={vi.fn()}
            onGraduate={vi.fn()}
            onAccount={vi.fn()}
            onScoreboard={vi.fn()}
            onEditCharacter={onEditCharacter}
        />,
    );
    return { view, onOpen, onEditCharacter };
}

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
    fireEvent.click(screen.getByRole("button", { name: "Launch game" })); // Year 1: the shooter
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(GAMES[0]);
    expect(
        screen
            .getByRole("button", { name: "Graduate" })
            .hasAttribute("disabled"),
    ).toBe(true);
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
