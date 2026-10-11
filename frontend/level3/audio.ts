import type { Phase } from "./chart";
import type { Hit } from "./engine";

const BASE = "/audio/sfx/thesis-defense";
const DEFAULT_VOLUME = 0.42;

const SFX = {
    title: ["td_title"],
    countTick: ["td_count_tick"],
    go: ["td_go"],
    perfect: ["td_stray_alt"],
    great: ["td_stray_alt"],
    good: ["td_stray_alt"],
    gold: ["td_gold"],
    miss: ["td_miss_alt"],
    stray: ["/audio/sfx/app/ui_panel_close.ogg"],
    comboBreak: ["td_combo_break"],
    multiplier: ["td_multiplier"],
    milestone1: ["td_milestone_1"],
    milestone2: ["td_milestone_2"],
    milestone3: ["td_milestone_3"],
    perfectStreak: ["td_perfect_streak"],
    eurekaReady: ["td_eureka_ready"],
    eurekaStart: ["td_eureka_start"],
    eurekaEnd: ["td_eureka_end"],
    phaseOpening: ["td_phase_opening"],
    phaseCross: ["td_phase_cross"],
    phaseLightning: ["td_phase_lightning"],
    phaseFinal: ["td_phase_final"],
    failed: ["td_failed"],
    complete: ["td_complete"],
    completeBig: ["td_complete_big"],
    verdictTop: ["td_verdict_top"],
    verdictMid: ["td_verdict_mid"],
    verdictLow: ["td_verdict_low"],
    newBest: ["td_new_best"],
    committeeImpressed: [
        "td_committee_impressed_1",
        "td_committee_impressed_2",
    ],
    committeeAmazed: ["td_committee_amazed_1", "td_committee_amazed_2"],
    committeeDisappointed: [
        "td_committee_disappointed_1",
        "td_committee_disappointed_2",
    ],
    committeeFurious: ["td_committee_furious_1", "td_committee_furious_2"],
    pause: ["td_pause"],
    resume: ["td_resume"],
} as const;

type ThesisCue = keyof typeof SFX;

const pool = new Map<string, HTMLAudioElement>();

function isTestBrowser(): boolean {
    return (
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("jsdom")
    );
}

function pick(keys: readonly string[]): string {
    return keys[Math.floor(Math.random() * keys.length)];
}

function pathFor(key: string): string {
    if (key.startsWith("/")) return key;
    return `${BASE}/${key}.ogg`;
}

function audioFor(path: string): HTMLAudioElement {
    const cached = pool.get(path);
    if (cached) return cached;
    const audio = new Audio(path);
    audio.preload = "auto";
    pool.set(path, audio);
    return audio;
}

export function phaseCue(phase: Phase): ThesisCue {
    switch (phase) {
        case "opening":
            return "phaseOpening";
        case "cross":
            return "phaseCross";
        case "meltdown":
            return "phaseLightning";
        case "final":
            return "phaseFinal";
    }
}

export function hitCue(judgment: Hit): ThesisCue {
    return judgment;
}

export default class ThesisAudio {
    constructor(private readonly muted: () => boolean) {}

    preload() {
        if (isTestBrowser()) return;
        for (const key of new Set(Object.values(SFX).flat()))
            audioFor(pathFor(key));
    }

    play(cue: ThesisCue, volume = DEFAULT_VOLUME) {
        if (this.muted() || isTestBrowser()) return;
        const template = audioFor(pathFor(pick(SFX[cue])));
        const audio = template.paused
            ? template
            : (template.cloneNode() as HTMLAudioElement);
        audio.volume = volume;
        audio.currentTime = 0;
        try {
            const playback = audio.play();
            if (playback)
                void playback.catch(() => {
                    /* Browsers may block samples until the first trusted key/click. */
                });
        } catch {
            /* Missing or locked audio should never stop the defense. */
        }
    }

    stop() {
        for (const audio of pool.values()) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
}
