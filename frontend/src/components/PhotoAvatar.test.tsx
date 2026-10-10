import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoAvatar } from "./PhotoAvatar";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function stubCamera(getUserMedia: () => Promise<MediaStream>) {
    vi.stubGlobal("navigator", {
        ...navigator,
        mediaDevices: { getUserMedia },
    });
}

describe("photo avatar", () => {
    it("opens the camera only when asked and can be cancelled", () => {
        const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => {}));
        stubCamera(getUserMedia);
        render(<PhotoAvatar disabled={false} onApply={vi.fn()} />);
        expect(getUserMedia).not.toHaveBeenCalled();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Use a photo to pick my colors",
            }),
        );
        expect(getUserMedia).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: "Take photo" })).toBeTruthy();
        expect(screen.getByText(/goes to our server.*OpenAI/s)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("button", { name: "Take photo" })).toBeNull();
    });

    it("falls back to the swatches when camera access is denied", async () => {
        stubCamera(() =>
            Promise.reject(new DOMException("denied", "NotAllowedError")),
        );
        const onApply = vi.fn();
        render(<PhotoAvatar disabled={false} onApply={onApply} />);

        fireEvent.click(
            screen.getByRole("button", {
                name: "Use a photo to pick my colors",
            }),
        );

        expect((await screen.findByRole("alert")).textContent).toMatch(
            /Camera access was denied/,
        );
        expect(onApply).not.toHaveBeenCalled();
    });
});
