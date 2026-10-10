import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import CompanionChat from "./CompanionChat";

const AI_REPLY = {
    id: "a".repeat(32),
    answer: "More balls wins.",
    source: "ai",
};
const play = vi.fn();
beforeEach(() => {
    play.mockReset().mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function openChat() {
    render(<CompanionChat playerName="Ada" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the dealer" }));
}

async function askQuestion(text: string) {
    fireEvent.change(screen.getByLabelText("Your question for the dealer"), {
        target: { value: text },
    });
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    });
}

describe("ask the dealer", () => {
    it("opens from a button and greets the player by name", () => {
        openChat();
        expect(screen.getByText(/Questions, Ada\?/)).toBeTruthy();
    });

    it("sends a question and shows the AI answer with a voice button", async () => {
        const askCompanion = vi
            .spyOn(api, "askCompanion")
            .mockResolvedValue({ ...AI_REPLY, source: "ai" });
        openChat();
        await askQuestion("  How do I win?  ");
        expect(askCompanion).toHaveBeenCalledWith("How do I win?");
        expect(screen.getByText("How do I win?")).toBeTruthy();
        expect(screen.getByText("More balls wins.")).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Listen to this answer" }),
        ).toBeTruthy();
    });

    it("asks a suggested question in one click", async () => {
        const askCompanion = vi
            .spyOn(api, "askCompanion")
            .mockResolvedValue({ ...AI_REPLY, source: "ai" });
        openChat();
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "How much should I bet?" }),
            );
        });
        expect(askCompanion).toHaveBeenCalledWith("How much should I bet?");
    });

    it("marks a pre-written answer and offers no voice for it", async () => {
        vi.spyOn(api, "askCompanion").mockResolvedValue({
            ...AI_REPLY,
            source: "fallback",
        });
        openChat();
        await askQuestion("Hello?");
        expect(screen.getByText(/the AI dealer is offline/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Listen/ })).toBeNull();
    });

    it("reads an answer aloud on request", async () => {
        vi.spyOn(api, "askCompanion").mockResolvedValue({
            ...AI_REPLY,
            source: "ai",
        });
        const speech = vi
            .spyOn(api, "companionSpeech")
            .mockResolvedValue("blob:dealer");
        openChat();
        await askQuestion("Say something");
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Listen to this answer" }),
            );
        });
        expect(speech).toHaveBeenCalledWith(AI_REPLY.id);
        expect(play).toHaveBeenCalledOnce();
        expect(
            screen.getByRole("button", { name: "Stop the dealer's voice" }),
        ).toBeTruthy();
    });

    it("reads every new answer aloud when the toggle is on", async () => {
        vi.spyOn(api, "askCompanion").mockResolvedValue({
            ...AI_REPLY,
            source: "ai",
        });
        const speech = vi
            .spyOn(api, "companionSpeech")
            .mockResolvedValue("blob:dealer");
        openChat();
        fireEvent.click(screen.getByLabelText("Read answers aloud"));
        await askQuestion("Talk to me");
        expect(speech).toHaveBeenCalledWith(AI_REPLY.id);
    });

    it("keeps the question and shows the error when asking fails", async () => {
        vi.spyOn(api, "askCompanion").mockRejectedValue(
            new Error("The dealer needs a break."),
        );
        openChat();
        await askQuestion("Again?");
        expect(screen.getByRole("alert").textContent).toContain("break");
        expect(
            (
                screen.getByLabelText(
                    "Your question for the dealer",
                ) as HTMLInputElement
            ).value,
        ).toBe("Again?");
    });
});
