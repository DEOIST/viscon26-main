// Fullscreen for a minigame's own container: a small button in the corner of the game and the
// F key, both toggling the element the game is mounted in. Phaser's FIT scaling refits the
// canvas on the resize this triggers; the letterbox takes the game's own background colour.
// Plain DOM, so it stays inside the minigame contract (no React, no navigation).

export interface FullscreenOptions {
    labels: { enter: string; exit: string };
    background: string; // CSS colour for the space around the canvas in fullscreen
}

export interface FullscreenHandle {
    toggle(): void;
    dispose(): void; // idempotent: leaves fullscreen, removes the button and the key handler
}

function isTyping(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
}

export function attachFullscreen(
    parent: HTMLElement,
    options: FullscreenOptions,
): FullscreenHandle {
    const previousBackground = parent.style.background;
    const isActive = () => document.fullscreenElement === parent;
    let disposed = false;

    const button = document.createElement("button");
    button.type = "button";
    Object.assign(button.style, {
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: "2",
        padding: "6px 12px",
        border: "1px solid rgba(255, 255, 255, 0.35)",
        borderRadius: "999px",
        background: "rgba(10, 18, 30, 0.72)",
        color: "#f2f6fd",
        font: "600 13px system-ui, sans-serif",
        cursor: "pointer",
    });

    function sync() {
        const active = isActive();
        button.textContent = active
            ? options.labels.exit
            : options.labels.enter;
        button.setAttribute("aria-pressed", String(active));
        parent.style.background = active
            ? options.background
            : previousBackground;
        // Phaser listens to window resizes to refit its canvas.
        window.dispatchEvent(new Event("resize"));
    }

    function toggle() {
        if (disposed) return;
        if (isActive()) void document.exitFullscreen?.().catch(() => undefined);
        else if (parent.requestFullscreen)
            void parent
                .requestFullscreen({ navigationUI: "hide" })
                .catch(() => undefined); // denied (no gesture, embedded): play on in place
    }

    function handleKey(event: KeyboardEvent) {
        if (event.code !== "KeyF" || event.repeat) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTyping(event.target)) return;
        event.preventDefault();
        toggle();
    }

    button.addEventListener("click", toggle);
    window.addEventListener("keydown", handleKey);
    document.addEventListener("fullscreenchange", sync);
    parent.appendChild(button);
    button.textContent = options.labels.enter;
    button.setAttribute("aria-pressed", "false");

    return {
        toggle,
        dispose() {
            if (disposed) return;
            disposed = true;
            window.removeEventListener("keydown", handleKey);
            document.removeEventListener("fullscreenchange", sync);
            button.remove();
            if (isActive())
                void document.exitFullscreen?.().catch(() => undefined);
            parent.style.background = previousBackground;
        },
    };
}
