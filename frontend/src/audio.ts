const UI_VOLUME = 0.32;

const UI_SOUNDS = {
    click: ["/audio/sfx/app/ui_click_1.ogg", "/audio/sfx/app/ui_click_2.ogg"],
    hover: ["/audio/sfx/app/ui_hover.ogg"],
    error: ["/audio/sfx/app/ui_error.ogg"],
    launch: ["/audio/sfx/app/sh_launch.ogg"],
    graduate: ["/audio/sfx/app/sh_graduate.ogg"],
    yearDone: ["/audio/sfx/app/sh_year_done.ogg"],
    scoreboard: ["/audio/sfx/app/sh_scoreboard.ogg"],
    panelOpen: ["/audio/sfx/app/panel_open_filtered.wav"],
    panelClose: ["/audio/sfx/app/panel_close_filtered.wav"],
    avatarReady: ["/audio/sfx/app/sh_avatar_ready.ogg"],
    letterIn: ["/audio/sfx/app/sh_letter_in.ogg"],
    stamp: ["/audio/sfx/app/sh_stamp.ogg"],
    swatch: [
        "/audio/sfx/app/sh_swatch_1.ogg",
        "/audio/sfx/app/sh_swatch_2.ogg",
    ],
    shutter: ["/audio/sfx/app/sh_shutter.ogg"],
    cutsceneWhoosh: [
        "/audio/sfx/app/cutscene_whoosh_1.wav",
        "/audio/sfx/app/cutscene_whoosh_2.wav",
    ],
    cutsceneTyping: ["/audio/sfx/app/cutscene_typing.wav"],
    cutscenePaper: ["/audio/sfx/app/cutscene_paper_move.wav"],
    cutsceneRecordScratch: ["/audio/sfx/app/cutscene_record_scratch.wav"],
    cutsceneHappy: [
        "/audio/sfx/app/cutscene_jump_short.wav",
        "/audio/sfx/app/cutscene_pop.wav",
    ],
    cutsceneHit: ["/audio/sfx/app/cutscene_hurt.wav"],
    cutsceneFinale: [
        "/audio/sfx/app/cutscene_explosion.wav",
        "/audio/sfx/app/cutscene_lose.wav",
    ],
    cutsceneComplete: ["/audio/sfx/app/cutscene_complete.wav"],
} as const;

type UiSound = keyof typeof UI_SOUNDS;

const pool = new Map<string, HTMLAudioElement>();

function pick(paths: readonly string[]): string {
    return paths[Math.floor(Math.random() * paths.length)];
}

function audioFor(path: string): HTMLAudioElement {
    const cached = pool.get(path);
    if (cached) return cached;
    const audio = new Audio(path);
    audio.preload = "auto";
    pool.set(path, audio);
    return audio;
}

export function playUiSound(sound: UiSound, volume = UI_VOLUME) {
    if (
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("jsdom")
    )
        return;
    const path = pick(UI_SOUNDS[sound]);
    const template = audioFor(path);
    const audio = template.paused
        ? template
        : (template.cloneNode() as HTMLAudioElement);
    audio.volume = volume;
    audio.currentTime = 0;
    try {
        const playback = audio.play();
        if (playback) {
            void playback.catch(() => {
                /* Browsers may block audio until the first trusted click. */
            });
        }
    } catch {
        /* Test environments and locked browsers may not implement playback. */
    }
}

function interactiveTarget(target: EventTarget | null): HTMLElement | null {
    return target instanceof HTMLElement
        ? target.closest("button, a, [role='button']")
        : null;
}

export function installUiSounds() {
    let lastHoverAt = 0;
    const handlePointerDown = (event: PointerEvent) => {
        const target = interactiveTarget(event.target);
        if (!target || target.getAttribute("aria-disabled") === "true") return;
        if (
            (target instanceof HTMLButtonElement ||
                target instanceof HTMLInputElement) &&
            target.disabled
        )
            return;
        playUiSound("click", 0.22);
    };
    const handlePointerOver = (event: PointerEvent) => {
        const target = interactiveTarget(event.target);
        if (!target || target.getAttribute("aria-disabled") === "true") return;
        const now = performance.now();
        if (now - lastHoverAt < 90) return;
        lastHoverAt = now;
        playUiSound("hover", 0.07);
    };
    document.addEventListener("pointerdown", handlePointerDown, {
        capture: true,
    });
    document.addEventListener("pointerover", handlePointerOver, {
        capture: true,
    });
    return () => {
        document.removeEventListener("pointerdown", handlePointerDown, {
            capture: true,
        });
        document.removeEventListener("pointerover", handlePointerOver, {
            capture: true,
        });
    };
}
