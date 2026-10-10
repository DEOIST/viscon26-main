import { useState } from "react";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AdmissionFlow from "./AdmissionFlow";
import { defaultPlayer } from "../store";
import type { Player } from "../types";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

function renderFlow(
    save: () => Promise<boolean>,
    stage: Player["onboardingStage"] = "builder",
) {
    const onSave = vi.fn(
        async (next: Player, beforeApply?: () => Promise<void>) => {
            const success = await save();
            if (success) {
                await beforeApply?.();
                update(next);
            }
            return success;
        },
    );
    let update: (player: Player) => void;
    function Harness() {
        const [player, setPlayer] = useState({
            ...defaultPlayer,
            name: "Ada",
            onboardingStage: stage,
        });
        update = setPlayer;
        return (
            <AdmissionFlow
                player={player}
                busy={false}
                error=""
                onSave={onSave}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onBegin={vi.fn()}
            />
        );
    }
    const view = render(<Harness />);
    return { ...view, onSave };
}

it("skips the presentation without bypassing the existing save or permitting duplicate submits", async () => {
    let resolve!: (success: boolean) => void;
    const pending = new Promise<boolean>((done) => {
        resolve = done;
    });
    const { container, onSave } = renderFlow(() => pending);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSave).toHaveBeenCalledOnce();
    expect(form.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Skip animation" }));
    expect(
        container.querySelector("[data-admission-phase=initializing]"),
    ).toBeTruthy();
    expect(screen.queryByText("ACCEPTED")).toBeNull();
    await act(async () => {
        resolve(true);
        await pending;
    });
    expect(
        container.querySelector("[data-admission-phase=complete]"),
    ).toBeTruthy();
    expect(
        screen
            .getByRole("button", { name: "Begin Year 1" })
            .hasAttribute("disabled"),
    ).toBe(false);
});

it("restores a usable builder after a failed save and allows retry", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const { container, onSave } = renderFlow(save);
    await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
    });
    expect(container.querySelector("[data-admission-phase=idle]")).toBeTruthy();
    expect(container.querySelector("form")!.hasAttribute("inert")).toBe(false);
    expect(screen.queryByText("Initializing student profile…")).toBeNull();
    await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
    });
    expect(onSave).toHaveBeenCalledTimes(2);
});

it("shows saved acceptance immediately without replaying or saving", () => {
    const { container, onSave } = renderFlow(async () => true, "acceptance");
    expect(container.querySelector("[data-admission-phase=idle]")).toBeTruthy();
    expect(
        screen
            .getByRole("button", { name: "Begin Year 1" })
            .hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.queryByRole("button", { name: "Skip animation" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
});

it("saves an edit after the first build straight back to the letter without replaying", async () => {
    const { container, onSave } = renderFlow(async () => true, "acceptance");
    fireEvent.click(screen.getByRole("button", { name: "Edit character" }));
    fireEvent.change(screen.getByLabelText("Character name"), {
        target: { value: "Grace" },
    });
    await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
    });
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toMatchObject({
        name: "Grace",
        onboardingStage: "acceptance",
    });
    expect(screen.queryByText("Initializing student profile…")).toBeNull();
    expect(container.querySelector("[data-admission-phase=idle]")).toBeTruthy();
    expect(container.querySelector(".terminal-cursor")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip animation" })).toBeNull();
    expect(
        screen
            .getByRole("button", { name: "Begin Year 1" })
            .hasAttribute("disabled"),
    ).toBe(false);
});

it("returns from an edit to the letter without saving", () => {
    const { container, onSave } = renderFlow(async () => true, "acceptance");
    fireEvent.click(screen.getByRole("button", { name: "Edit character" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByRole("button", { name: "Begin Year 1" })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
});

it("completes promptly with reduced motion after the save succeeds", async () => {
    vi.stubGlobal("matchMedia", () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
    }));
    const { container } = renderFlow(async () => true);
    await act(async () => {
        fireEvent.submit(container.querySelector("form")!);
    });
    expect(
        container.querySelector("[data-admission-phase=complete]"),
    ).toBeTruthy();
    expect(document.querySelector(".admission-avatar-transfer")).toBeNull();
});

it("moves to the inset portrait bounds and reveals the same size without a jump", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
            if (this.matches("[data-admission-avatar] .avatar"))
                return new DOMRect(514, 110, 72, 80);
            if (this.matches("[data-admission-avatar]"))
                return new DOMRect(500, 100, 100, 100);
            return new DOMRect(100, 100, 180, 200);
        },
    );
    const original = Element.prototype.animate;
    const cancel = vi.fn();
    const animate = vi.fn(
        (_frames: Keyframe[] | PropertyIndexedKeyframes | null) =>
            ({ cancel }) as unknown as Animation,
    );
    Element.prototype.animate = animate;
    try {
        const { container } = renderFlow(async () => true);
        await act(async () => {
            fireEvent.submit(container.querySelector("form")!);
            await vi.advanceTimersByTimeAsync(780);
        });
        const frames = animate.mock.calls[0]?.[0] as Keyframe[] | undefined;
        expect(frames?.at(-1)?.transform).toBe(
            "translate(414px, 10px) scale(0.4, 0.4)",
        );
        expect(
            document.querySelector(".admission-avatar-transfer"),
        ).toBeTruthy();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(720);
        });
        expect(document.querySelector(".admission-avatar-transfer")).toBeNull();
        expect(
            container.querySelector("[data-admission-phase=emblem]"),
        ).toBeTruthy();
        expect(cancel).toHaveBeenCalled();
    } finally {
        Element.prototype.animate = original;
    }
});
