import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import HistoryDialog from "./HistoryDialog";

beforeEach(() => {
    // jsdom has no modal dialogs; open them the way a browser would.
    HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
    };
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("history dialog", () => {
    it("invites guests to sign in without calling the server", () => {
        const activity = vi.spyOn(api, "activity");
        const onAccount = vi.fn();
        render(
            <HistoryDialog
                authenticated={false}
                onClose={vi.fn()}
                onAccount={onAccount}
            />,
        );
        fireEvent.click(screen.getByText("Log in / Register"));
        expect(onAccount).toHaveBeenCalledOnce();
        expect(activity).not.toHaveBeenCalled();
    });

    it("shows streaks, best scores, the graph and recent rounds", async () => {
        vi.spyOn(api, "activity").mockResolvedValue({
            today: "2026-10-10",
            days: [
                { day: "2026-10-09", attempts: 1 },
                { day: "2026-10-10", attempts: 2 },
            ],
            totalAttempts: 3,
            activeDays: 2,
            currentStreak: 2,
            longestStreak: 5,
            bestScores: { "year-1-slot": 88 },
        });
        vi.spyOn(api, "attempts").mockResolvedValue([
            {
                id: 3,
                gameId: "year-1-slot",
                score: 88,
                finishedAt: "2026-10-10T12:00:00Z",
            },
        ]);
        render(
            <HistoryDialog
                authenticated
                onClose={vi.fn()}
                onAccount={vi.fn()}
            />,
        );
        expect(await screen.findByText("Current streak")).toBeTruthy();
        expect(screen.getByText("2 days")).toBeTruthy();
        expect(screen.getByText("5 days")).toBeTruthy();
        expect(
            screen.getByRole("img", {
                name: "3 rounds on 2 days in the last year",
            }),
        ).toBeTruthy();
        expect(screen.getByTitle("2 rounds on Sat, 10 Oct 2026")).toBeTruthy();
        expect(screen.getAllByRole("row")).toHaveLength(2); // header + one round
    });

    it("offers a retry when the history can't load", async () => {
        const activity = vi
            .spyOn(api, "activity")
            .mockRejectedValue(new Error("Cannot reach the server."));
        vi.spyOn(api, "attempts").mockResolvedValue([]);
        render(
            <HistoryDialog
                authenticated
                onClose={vi.fn()}
                onAccount={vi.fn()}
            />,
        );
        expect(await screen.findByRole("alert")).toBeTruthy();
        fireEvent.click(screen.getByText("Try again"));
        expect(activity).toHaveBeenCalledTimes(2);
    });
});
