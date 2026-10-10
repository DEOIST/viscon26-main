import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachFullscreen } from "./fullscreen";

const labels = { enter: "Fullscreen (F)", exit: "Exit fullscreen (F)" };
let parent: HTMLElement;
let fullscreenElement: Element | null = null;

beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
    fullscreenElement = null;
    Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreenElement,
    });
    parent.requestFullscreen = vi.fn(() => {
        fullscreenElement = parent;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
    });
    document.exitFullscreen = vi.fn(() => {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
    });
});
afterEach(() => parent.remove());

const press = (code: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent("keydown", { code, ...init }));

describe("attachFullscreen", () => {
    it("adds a labelled button that toggles fullscreen on the game's container", () => {
        const handle = attachFullscreen(parent, {
            labels,
            background: "#0b2a18",
        });
        const button = parent.querySelector("button")!;
        expect(button.textContent).toBe(labels.enter);
        button.click();
        expect(parent.requestFullscreen).toHaveBeenCalledOnce();
        expect(button.textContent).toBe(labels.exit);
        expect(parent.style.background).not.toBe("");
        button.click();
        expect(document.exitFullscreen).toHaveBeenCalledOnce();
        expect(button.textContent).toBe(labels.enter);
        handle.dispose();
    });

    it("toggles on F but not while typing or with a modifier", () => {
        const handle = attachFullscreen(parent, { labels, background: "#000" });
        press("KeyF", { ctrlKey: true });
        expect(parent.requestFullscreen).not.toHaveBeenCalled();
        press("KeyF");
        expect(parent.requestFullscreen).toHaveBeenCalledOnce();
        handle.dispose();
    });

    it("tells the game engine to refit after the size changes", () => {
        const resize = vi.fn();
        window.addEventListener("resize", resize);
        const handle = attachFullscreen(parent, { labels, background: "#000" });
        press("KeyF");
        expect(resize).toHaveBeenCalled();
        window.removeEventListener("resize", resize);
        handle.dispose();
    });

    it("cleans up: no button, no key handling, background restored, fullscreen left", () => {
        parent.style.background = "red";
        const handle = attachFullscreen(parent, { labels, background: "#000" });
        press("KeyF");
        handle.dispose();
        handle.dispose(); // safe twice
        expect(parent.querySelector("button")).toBeNull();
        expect(document.exitFullscreen).toHaveBeenCalledOnce();
        expect(parent.style.background).toBe("red");
        press("KeyF");
        expect(parent.requestFullscreen).toHaveBeenCalledOnce();
    });
});
