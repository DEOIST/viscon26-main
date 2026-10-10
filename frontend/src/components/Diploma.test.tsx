import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GAMES, YEARS } from "../config";
import { defaultPlayer } from "../store";
import { GraduationScreen } from "./Screens";

beforeEach(() => {
    Object.defineProperties(HTMLDialogElement.prototype, {
        showModal: {
            configurable: true,
            value: vi.fn(function (this: HTMLDialogElement) {
                this.setAttribute("open", "");
            }),
        },
        close: {
            configurable: true,
            value: vi.fn(function (this: HTMLDialogElement) {
                this.removeAttribute("open");
            }),
        },
    });
});

afterEach(cleanup);

function graduationArgs() {
    return {
        player: {
            ...defaultPlayer,
            name: "Ada Lovelace",
            character: {
                ...defaultPlayer.character,
                hairLength: "long" as const,
                glasses: "glasses" as const,
            },
        },
        ects: 120,
        completedGameIds: GAMES.filter((game) => game.implemented).map(
            (game) => game.id,
        ),
        graduatedAt: "2026-10-10T12:00:00.000Z",
        onReturn: vi.fn(),
        onLeaderboard: vi.fn(),
        onRetry: vi.fn(),
    };
}

it("opens a diploma with the player's actual results, appearance and saved graduation date", () => {
    const args = graduationArgs();
    render(<GraduationScreen {...args} />);
    const diploma = within(screen.getByRole("dialog"));
    expect(
        diploma.getByRole("heading", {
            name: "Congratulations, Ada Lovelace!",
        }),
    ).toBeTruthy();
    expect(diploma.getByText("120 ECTS")).toBeTruthy();
    expect(diploma.getByText("D-INFK")).toBeTruthy();
    expect(diploma.queryByText("Score")).toBeNull();
    expect(
        diploma.getByText("Completed years").nextElementSibling?.textContent,
    ).toBe(
        `${YEARS.filter((year) => year.games.every((game) => args.completedGameIds.includes(game.id))).length} / ${YEARS.length}`,
    );
    expect(
        diploma.getByText("Completed minigames").nextElementSibling
            ?.textContent,
    ).toBe(`${args.completedGameIds.length} / ${GAMES.length}`);
    expect(
        diploma
            .getByText(
                new Date(args.graduatedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
            )
            .getAttribute("datetime"),
    ).toBe(args.graduatedAt);
    const avatar = diploma.getByRole("img", { name: "Graduate Ada Lovelace" });
    expect(avatar.querySelector("[data-testid=avatar-long-hair]")).toBeTruthy();
    expect(avatar.querySelector("[data-testid=avatar-glasses]")).toBeTruthy();
    expect(diploma.getByText(/Unofficial game diploma/)).toBeTruthy();
});

it("keeps graduation visible and reopens the same diploma without resubmitting or resetting", () => {
    const args = graduationArgs();
    const view = render(<GraduationScreen {...args} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to graduation" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
        screen.getByRole("heading", { name: "You did it, Ada Lovelace." }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View diploma" }));
    view.rerender(<GraduationScreen {...args} />);
    expect(
        within(screen.getByRole("dialog")).getByText("120 ECTS"),
    ).toBeTruthy();
    expect(args.onRetry).not.toHaveBeenCalled();
    expect(args.onReturn).not.toHaveBeenCalled();
    expect(args.onLeaderboard).not.toHaveBeenCalled();
});

it("keeps the diploma accessible after submission failure and retries only on request", () => {
    const args = { ...graduationArgs(), submissionError: "Server offline" };
    const view = render(<GraduationScreen {...args} />);
    const diploma = within(screen.getByRole("dialog"));
    expect(diploma.getByText("120 ECTS")).toBeTruthy();
    expect(diploma.getByText("Server offline")).toBeTruthy();
    expect(args.onRetry).not.toHaveBeenCalled();
    fireEvent.click(
        diploma.getByRole("button", { name: "Retry leaderboard update" }),
    );
    expect(args.onRetry).toHaveBeenCalledOnce();
    view.rerender(<GraduationScreen {...args} submitting />);
    expect(
        within(screen.getByRole("dialog"))
            .getByRole("button", { name: "Submitting…" })
            .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to graduation" }));
    expect(screen.getByRole("button", { name: "View diploma" })).toBeTruthy();
    expect(args.onReturn).not.toHaveBeenCalled();
});

it("closes the diploma before opening the leaderboard", () => {
    const args = graduationArgs();
    render(<GraduationScreen {...args} />);
    fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
            name: "View leaderboard",
        }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(args.onLeaderboard).toHaveBeenCalledOnce();
    expect(args.onRetry).not.toHaveBeenCalled();
});

it("counts each known minigame once and does not invent a missing date", () => {
    const args = graduationArgs();
    render(
        <GraduationScreen
            {...args}
            completedGameIds={[
                ...args.completedGameIds,
                ...args.completedGameIds,
                "unknown-game",
            ]}
            graduatedAt={null}
        />,
    );
    const diploma = within(screen.getByRole("dialog"));
    expect(
        diploma.getByText("Completed minigames").nextElementSibling
            ?.textContent,
    ).toBe(`${args.completedGameIds.length} / ${GAMES.length}`);
    expect(diploma.getByText("Date not recorded")).toBeTruthy();
});

it("labels a preview clearly and uses current progress without recording graduation", () => {
    const args = graduationArgs();
    render(
        <GraduationScreen
            {...args}
            ects={0}
            completedGameIds={[]}
            graduatedAt={null}
            submissionError="Server offline"
            preview
        />,
    );
    const diploma = within(screen.getByRole("dialog"));
    expect(diploma.getByText("0 ECTS")).toBeTruthy();
    expect(diploma.getByText("Not graduated")).toBeTruthy();
    expect(
        diploma.getByText(
            /Test preview · Your progress and leaderboard are unchanged/,
        ),
    ).toBeTruthy();
    expect(
        diploma.queryByRole("button", { name: "Retry leaderboard update" }),
    ).toBeNull();
    fireEvent.click(
        diploma.getByRole("button", { name: "Back to graduation" }),
    );
    expect(screen.getByText("GRADUATION PREVIEW")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View diploma" }));
    expect(args.onRetry).not.toHaveBeenCalled();
    expect(args.onReturn).not.toHaveBeenCalled();
});

it("names the career that the earned ECTS buy, with its photo and jokes", () => {
    const args = graduationArgs(); // 120 of 180 ECTS = 66 %: the PhD tier
    render(<GraduationScreen {...args} />);
    const diploma = within(screen.getByRole("dialog"));
    expect(diploma.getByText("PhD student at ETH, year 7")).toBeTruthy();
    expect(diploma.getByText("Magna cum laude")).toBeTruthy();
    expect(diploma.getByText("Your office desk, after 22:00")).toBeTruthy();
    expect(
        diploma.getByRole("img", {
            name: /doctoral hat built from pizza boxes/,
        }),
    ).toBeTruthy();
    cleanup();
    render(<GraduationScreen {...args} ects={30} />);
    expect(
        within(screen.getByRole("dialog")).getByText("Homeless in Zürich"),
    ).toBeTruthy();
});
