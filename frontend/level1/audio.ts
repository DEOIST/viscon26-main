import type { Scene, Sound } from "phaser";

const MUSIC_KEY = "bb_music";
const BASE = "/audio/sfx/bug-bash";
const EXTRA_SFX = ["internet_slap.mp3"] as const;

const SFX = {
    calibStep: ["bb_calib_step"],
    calibOk: ["bb_calib_ok"],
    calibFail: ["bb_calib_fail"],
    calibDone: ["bb_calib_done"],
    practicePop: ["bb_practice_pop"],
    countTick: ["bb_count_tick"],
    countLast: ["bb_count_last"],
    go: ["bb_go"],
    grab: ["bb_grab_1", "bb_grab_2", "bb_grab_3"],
    grabMiss: ["bb_grab_miss_1", "bb_grab_miss_2"],
    heldLoop: ["bb_held_loop"],
    drop: ["bb_drop"],
    throw: ["bb_throw_1", "bb_throw_2", "bb_throw_3"],
    bomb: ["bb_bomb"],
    bugEscape: ["bb_bug_escape"],
    bugSpawn: ["bb_bug_spawn_1", "bb_bug_spawn_2"],
    fuseOut: ["bb_fuse_out"],
    halfway: ["bb_halfway"],
    roundEnd: ["bb_round_end"],
    score: ["bb_score"],
    slapWhiff: ["bb_slap_whiff_1", "bb_slap_whiff_2"],
    streak: ["bb_streak"],
    walkerIn: ["bb_walker_in_1", "bb_walker_in_2", "bb_walker_in_3"],
    walkerLeave: ["bb_walker_leave"],
    walkerSlap: ["slap.wav"],
} as const;

type ShooterCue = keyof typeof SFX;

function pick(keys: readonly string[]): string {
    return keys[Math.floor(Math.random() * keys.length)];
}

export function loadShooterAudio(scene: Scene) {
    scene.load.audio(MUSIC_KEY, "/audio/music/bug-bash.ogg");
    for (const key of new Set([...Object.values(SFX).flat(), ...EXTRA_SFX]))
        scene.load.audio(
            key,
            key.includes(".") ? `${BASE}/${key}` : `${BASE}/${key}.ogg`,
        );
}

export default class ShooterAudio {
    private music: Sound.BaseSound | null = null;
    private heldLoop: Sound.BaseSound | null = null;

    constructor(private readonly scene: Scene) {
        this.scene.events.once("shutdown", () => this.stop());
    }

    startMusic() {
        if (this.music?.isPlaying) return;
        try {
            this.music = this.scene.sound.add(MUSIC_KEY, {
                loop: true,
                volume: 0.28,
            });
            this.music.play();
        } catch {
            /* Sound is optional gameplay polish. */
        }
    }

    play(cue: ShooterCue, volume = 0.62) {
        if (cue === "walkerSlap") {
            this.playKey("slap.wav", volume * 0.68);
            this.playKey("internet_slap.mp3", volume * 0.78);
            return;
        }
        this.playKey(pick(SFX[cue]), volume);
    }

    private playKey(key: string, volume: number) {
        try {
            this.scene.sound.play(key, { volume });
        } catch {
            /* Ignore missing, locked or interrupted audio. */
        }
    }

    startHeldLoop() {
        if (this.heldLoop?.isPlaying) return;
        try {
            this.heldLoop = this.scene.sound.add("bb_held_loop", {
                loop: true,
                volume: 0.18,
            });
            this.heldLoop.play();
        } catch {
            /* Optional loop. */
        }
    }

    stopHeldLoop() {
        this.heldLoop?.stop();
        this.heldLoop?.destroy();
        this.heldLoop = null;
    }

    stop() {
        this.stopHeldLoop();
        this.music?.stop();
        this.music?.destroy();
        this.music = null;
    }
}
