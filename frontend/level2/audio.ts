import type { Scene, Sound } from "phaser";

const MUSIC_KEY = "cj_music";
const AMBIENCE_KEY = "cj_amb_casino";
const BASE = "/audio/sfx/casino-night";

const SFX = {
    banner: ["cj_banner"],
    blackjack: ["cj_blackjack"],
    cardFade: ["cj_card_fade"],
    cardFlip: ["cj_card_flip_1", "cj_card_flip_2"],
    cardSlide: ["cj_card_slide_1", "cj_card_slide_2", "cj_card_slide_3"],
    chipHover: ["cj_chip_hover"],
    chipPlace: ["cj_chip_place_1", "cj_chip_place_2", "cj_chip_place_3"],
    chipRemove: ["cj_chip_remove_1", "cj_chip_remove_2"],
    chipsLose: ["cj_chips_lose"],
    chipsWin: ["cj_chips_win"],
    clear: ["cj_clear"],
    countUp: ["cj_count_up"],
    courtRattle: ["cj_court_rattle"],
    double: ["cj_double"],
    gameoverBroke: ["steel_drums_negative.wav"],
    gameoverDown: ["cj_gameover_down"],
    gameoverUp: ["cj_gameover_up"],
    landGreen: [
        "cj_land_green_1",
        "cj_land_green_2",
        "cj_land_green_3",
        "cj_land_green_4",
    ],
    landRed: ["cj_land_red_1", "cj_land_red_2"],
    landYellow: ["cj_land_yellow_1", "cj_land_yellow_2", "cj_land_yellow_3"],
    lose: ["vibraphone_negative.wav"],
    pinTick: [
        "cj_pin_tick_1",
        "cj_pin_tick_2",
        "cj_pin_tick_3",
        "cj_pin_tick_4",
        "cj_pin_tick_5",
        "cj_pin_tick_6",
    ],
    popBurst: ["cj_pop_burst"],
    popFew: ["cj_pop_few_1", "cj_pop_few_2"],
    push: ["cj_push"],
    shuffle: ["cj_shuffle"],
    threeYellow: ["cj_three_yellow"],
    win: ["cj_win"],
} as const;

type BlackjackCue = keyof typeof SFX;
type VolumeSound = Sound.BaseSound & { setVolume(value: number): void };

function pick(keys: readonly string[]): string {
    return keys[Math.floor(Math.random() * keys.length)];
}

export function loadBlackjackAudio(scene: Scene) {
    scene.load.audio(MUSIC_KEY, "/audio/music/casino-night.ogg");
    scene.load.audio(AMBIENCE_KEY, `${BASE}/amb_casino.ogg`);
    for (const key of new Set(Object.values(SFX).flat()))
        scene.load.audio(
            key,
            key.includes(".") ? `${BASE}/${key}` : `${BASE}/${key}.ogg`,
        );
}

export default class BlackjackAudio {
    private music: Sound.BaseSound | null = null;
    private ambience: Sound.BaseSound | null = null;

    constructor(private readonly scene: Scene) {
        this.scene.events.once("shutdown", () => this.stop());
    }

    startTable() {
        if (this.music?.isPlaying) return;
        try {
            const musicVolume = 0.24;
            const ambienceVolume = 0.13;
            this.music = this.scene.sound.add(MUSIC_KEY, {
                loop: true,
                volume: 0,
            });
            this.ambience = this.scene.sound.add(AMBIENCE_KEY, {
                loop: true,
                volume: 0,
            });
            this.music.play();
            this.ambience.play();
            this.scene.tweens.add({
                targets: { music: 0, ambience: 0 },
                music: musicVolume,
                ambience: ambienceVolume,
                duration: 900,
                ease: "Sine.easeInOut",
                onUpdate: (tween) => {
                    const source = tween.targets[0] as {
                        music: number;
                        ambience: number;
                    };
                    (this.music as VolumeSound | null)?.setVolume(
                        source.music,
                    );
                    (this.ambience as VolumeSound | null)?.setVolume(
                        source.ambience,
                    );
                },
            });
        } catch {
            /* Audio is non-critical. */
        }
    }

    play(cue: BlackjackCue, volume = 0.58) {
        try {
            this.scene.sound.play(pick(SFX[cue]), { volume });
        } catch {
            /* Ignore missing, locked or interrupted audio. */
        }
    }

    stop() {
        this.music?.stop();
        this.ambience?.stop();
        this.music?.destroy();
        this.ambience?.destroy();
        this.music = null;
        this.ambience = null;
    }
}
