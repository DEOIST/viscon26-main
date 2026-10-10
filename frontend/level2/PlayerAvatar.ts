// The player's seat: the character from the builder, assembled from separate parts (avatar.ts)
// so it can blink and fidget while idle, cry over a lost hand and celebrate a win with arms up,
// jumps and confetti. The scene only picks the mood; each mood animates itself and calms back
// down to idle on its own.
//
// Inside the container everything is in avatar units, with (0, 0) on the portrait's centre.

import { GameObjects, Math as PhaserMath, Utils } from "phaser";
import type { Scene, Time, Tweens } from "phaser";
import {
    BODY_BASE,
    FRAME,
    NECK,
    SHOULDERS,
    TEAR_SPOTS,
    AVATAR_TEXTURE,
    originOf,
} from "./avatar";
import type { AvatarPart } from "./avatar";
import {
    AVATAR_TEXTURE_SCALE,
    BIG_CELEBRATE_MS,
    BLINK_MS,
    CELEBRATE_MS,
    CRY_MS,
    FIDGET_MS,
} from "./config";
import { PORTRAIT } from "./layout";
import type { Point } from "./layout";
import { COLORS } from "./textures";
import { floatText } from "./ui";

type Mood = "idle" | "cry" | "celebrate";

const SCALE = (PORTRAIT.scale * PORTRAIT.ring) / FRAME.r;
const PART_SCALE = 1 / AVATAR_TEXTURE_SCALE;

// Back to front; every head part pivots on the neck.
const HEAD_PARTS: AvatarPart[] = [
    "head",
    "blush",
    "browsNeutral",
    "browsSad",
    "browsHappy",
    "eyesOpen",
    "eyesClosed",
    "eyesHappy",
    "eyesCry",
    "tears",
    "glasses",
    "mouthSmile",
    "mouthCry",
    "mouthGrin",
];

interface Face {
    brows: AvatarPart;
    eyes: AvatarPart;
    mouth: AvatarPart;
    extras: AvatarPart[];
}
const FACES: Record<Mood, Face> = {
    idle: {
        brows: "browsNeutral",
        eyes: "eyesOpen",
        mouth: "mouthSmile",
        extras: [],
    },
    cry: {
        brows: "browsSad",
        eyes: "eyesCry",
        mouth: "mouthCry",
        extras: ["tears"],
    },
    celebrate: {
        brows: "browsHappy",
        eyes: "eyesHappy",
        mouth: "mouthGrin",
        extras: ["blush"],
    },
};
// Every part a face shows or hides; the blink's closed eyes only appear mid-blink.
const EXPRESSIONS = new Set<AvatarPart>([
    "eyesClosed",
    ...Object.values(FACES).flatMap((f) => [
        f.brows,
        f.eyes,
        f.mouth,
        ...f.extras,
    ]),
]);
const CHEERS = ["YES!", "WOO!", "LET'S GO!", "EZ!", "YEAH!"];
const CHEER_COLORS = ["#f5c451", "#6ccfa6", "#ffffff"];

export default class PlayerAvatar extends GameObjects.Container {
    private readonly rig: GameObjects.Container; // jumps, squashes and spins
    private readonly neck: GameObjects.Container; // breathes
    private readonly head: GameObjects.Container; // tilts, sobs and wobbles
    private readonly glow: GameObjects.Arc;
    private readonly parts = new Map<AvatarPart, GameObjects.Image>();
    private readonly confetti: GameObjects.Particles.ParticleEmitter;
    private readonly stars: GameObjects.Particles.ParticleEmitter;
    private mood: Mood = "idle";
    private big = false;
    private moodTweens: Tweens.Tween[] = [];
    private moodTimers: Time.TimerEvent[] = [];
    private calmDown: Time.TimerEvent | null = null;
    private tears: GameObjects.Image[] = [];

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y);
        this.setScale(SCALE);

        this.glow = new GameObjects.Arc(
            scene,
            0,
            0,
            PORTRAIT.glow / SCALE,
            0,
            360,
            false,
            COLORS.gold,
            0.18,
        );
        const frame = new GameObjects.Image(
            scene,
            0,
            0,
            "avatar-frame",
        ).setScale(FRAME.r / PORTRAIT.ring);
        this.neck = new GameObjects.Container(
            scene,
            NECK.x - FRAME.x,
            NECK.y - FRAME.y,
        );
        this.head = new GameObjects.Container(scene);
        this.neck.add(this.head);
        for (const part of HEAD_PARTS)
            this.addPart(this.head, part, NECK, NECK);

        this.rig = new GameObjects.Container(scene);
        this.rig.add([this.glow, frame]);
        this.addPart(this.rig, "armLeft", SHOULDERS.left, FRAME);
        this.addPart(this.rig, "armRight", SHOULDERS.right, FRAME);
        this.addPart(this.rig, "body", BODY_BASE, FRAME);
        this.rig.add(this.neck);
        this.add(this.rig);
        scene.add.existing(this);

        this.confetti = scene.add
            .particles(0, 0, "confetti", {
                speed: { min: 260, max: 560 },
                angle: { min: -160, max: -20 },
                gravityY: 760,
                lifespan: 1500,
                rotate: { start: 0, end: 720 },
                scale: { start: 1, end: 0.7 },
                tint: [
                    COLORS.gold,
                    COLORS.red,
                    COLORS.green,
                    0x6fa8ee,
                    0xffffff,
                ],
                emitting: false,
            })
            .setDepth(8);
        this.stars = scene.add
            .particles(0, 0, "spark", {
                speed: { min: 60, max: 220 },
                lifespan: { min: 500, max: 900 },
                scale: { start: 1.1, end: 0 },
                rotate: { min: 0, max: 360 },
                tint: COLORS.gold,
                emitting: false,
            })
            .setDepth(8);

        this.breathe();
        this.startIdle();
    }

    // --- What the scene calls --------------------------------------------------------

    idle() {
        this.setMood("idle");
    }

    cry() {
        this.setMood("cry");
    }

    celebrate(big = false) {
        this.setMood("celebrate", big);
    }

    // Above the game-over shade, so the last reaction stays visible.
    lift(depth: number) {
        this.setDepth(depth);
        this.confetti.setDepth(depth + 1);
        this.stars.setDepth(depth + 1);
    }

    // --- Building --------------------------------------------------------------------

    // A part's texture spans the whole avatar canvas; its origin is the pivot it turns on, and
    // it sits at that pivot inside a parent container whose own origin is `base`.
    private addPart(
        parent: GameObjects.Container,
        part: AvatarPart,
        pivot: Point,
        base: Point,
    ) {
        if (!this.scene.textures.get(AVATAR_TEXTURE).has(part)) return; // no glasses
        const origin = originOf(pivot);
        const image = new GameObjects.Image(
            this.scene,
            pivot.x - base.x,
            pivot.y - base.y,
            AVATAR_TEXTURE,
            part,
        )
            .setOrigin(origin.x, origin.y)
            .setScale(PART_SCALE);
        if (EXPRESSIONS.has(part) || part.startsWith("arm"))
            image.setVisible(false);
        parent.add(image);
        this.parts.set(part, image);
    }

    // Always on, whatever the mood: the seat floats like the dealer's, the chest breathes.
    private breathe() {
        const { tweens } = this.scene;
        tweens.add({
            targets: this,
            y: this.y - 5,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
        tweens.add({
            targets: this.glow,
            scale: 1.12,
            alpha: 0.06,
            duration: 1600,
            yoyo: true,
            repeat: -1,
        });
        const body = this.parts.get("body");
        if (body)
            tweens.add({
                targets: body,
                scaleY: PART_SCALE * 1.025,
                duration: 1700,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            });
        tweens.add({
            targets: this.neck,
            y: this.neck.y - 1.5,
            duration: 1700,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
    }

    // --- Moods -----------------------------------------------------------------------

    private setMood(mood: Mood, big = false) {
        if (mood === this.mood) {
            if (mood === "idle") return;
            if (!big || this.big) return this.scheduleCalm(); // already at it: keep going
        }
        this.stopMood();
        this.mood = mood;
        this.big = big;
        if (mood === "idle") return this.startIdle();
        if (mood === "cry") this.startCry();
        else this.startCelebrate(big);
        this.scheduleCalm();
    }

    private scheduleCalm() {
        this.calmDown?.remove();
        const ms =
            this.mood === "cry"
                ? CRY_MS
                : this.big
                  ? BIG_CELEBRATE_MS
                  : CELEBRATE_MS;
        this.calmDown = this.scene.time.delayedCall(ms, () =>
            this.setMood("idle"),
        );
    }

    private stopMood() {
        this.calmDown?.remove();
        this.calmDown = null;
        this.moodTweens.forEach((tween) => tween.stop());
        this.moodTimers.forEach((timer) => timer.remove());
        this.moodTweens = [];
        this.moodTimers = [];
        this.scene.tweens.killTweensOf(this.tears);
        this.tears.forEach((tear) => tear.destroy());
        this.tears = [];

        this.head.setPosition(0, 0).setAngle(0);
        this.rig.setPosition(0, 0).setScale(1).setAngle(0);
        this.parts.get("eyesOpen")?.setX(0);
        this.parts.get("mouthCry")?.setScale(PART_SCALE);
        for (const arm of ["armLeft", "armRight"] as const)
            this.parts.get(arm)?.setVisible(false).setAngle(0).setAlpha(1);
        this.glow.setFillStyle(COLORS.gold, 0.18);
    }

    private show(face: Face) {
        const wanted = new Set([
            face.brows,
            face.eyes,
            face.mouth,
            ...face.extras,
        ]);
        for (const [part, image] of this.parts)
            if (EXPRESSIONS.has(part)) image.setVisible(wanted.has(part));
    }

    // Idle: a slow head sway, and every few seconds a blink (sometimes two) or a glance.
    private startIdle() {
        this.show(FACES.idle);
        this.wave(4800, (phase) => this.head.setAngle(2.5 * Math.sin(phase)));
        this.fidget();
    }

    private fidget() {
        this.later(PhaserMath.Between(FIDGET_MS.min, FIDGET_MS.max), () => {
            if (Math.random() < 0.7) this.blink(Math.random() < 0.25);
            else this.glance();
            this.fidget();
        });
    }

    private blink(twice: boolean) {
        const open = this.parts.get("eyesOpen");
        const closed = this.parts.get("eyesClosed");
        if (!open || !closed) return;
        open.setVisible(false);
        closed.setVisible(true);
        this.later(BLINK_MS, () => {
            open.setVisible(true);
            closed.setVisible(false);
            if (twice) this.later(BLINK_MS * 1.4, () => this.blink(false));
        });
    }

    private glance() {
        const eyes = this.parts.get("eyesOpen");
        if (!eyes) return;
        this.track(
            this.scene.tweens.add({
                targets: eyes,
                x: Math.random() < 0.5 ? -2.5 : 2.5,
                duration: 180,
                hold: 800,
                yoyo: true,
                ease: "Sine.easeInOut",
            }),
        );
    }

    // Crying: squeezed eyes, a wailing mouth, sobbing shoulders and a steady stream of tears.
    private startCry() {
        this.show(FACES.cry);
        this.glow.setFillStyle(0x6fa8ee, 0.22);
        const mouth = this.parts.get("mouthCry");
        this.wave(460, (phase) => {
            const sob = Math.abs(Math.sin(phase));
            this.head
                .setPosition(Math.sin(phase * 2) * 1.2, 4 + sob * 2.5)
                .setAngle(-4 + Math.sin(phase) * 1.5);
            this.rig.setScale(1 + sob * 0.012, 1 - sob * 0.02);
            mouth?.setScale(PART_SCALE * (1 + sob * 0.1), PART_SCALE);
        });
        const streams = this.parts.get("tears");
        this.wave(900, (phase) =>
            streams?.setAlpha(0.65 + 0.35 * Math.sin(phase)),
        );
        let side = 0;
        this.every(170, () => this.dropTear(side++ % 2));
    }

    private dropTear(side: number) {
        const spot = TEAR_SPOTS[side];
        const outwards = side === 0 ? -1 : 1;
        const x = spot.x - NECK.x;
        const y = spot.y - NECK.y;
        const tear = new GameObjects.Image(this.scene, x, y, "tear").setScale(
            0.5,
        );
        this.head.add(tear);
        this.tears.push(tear);
        const { tweens } = this.scene;
        tweens.add({
            targets: tear,
            x: x + outwards * PhaserMath.Between(4, 16),
            y: y + PhaserMath.Between(50, 72),
            scale: 1,
            duration: PhaserMath.Between(600, 800),
            ease: "Quad.easeIn",
            onComplete: () => {
                this.tears = this.tears.filter((t) => t !== tear);
                tear.destroy();
            },
        });
        tweens.add({ targets: tear, alpha: 0, delay: 420, duration: 260 });
    }

    // Celebrating: arms up and waving, a beaming face, jumps with a squash on every landing,
    // confetti and cheers. A big win adds a spin and keeps going longer.
    private startCelebrate(big: boolean) {
        this.show(FACES.celebrate);
        this.glow.setFillStyle(COLORS.gold, 0.4);
        const { tweens } = this.scene;

        const arms = (["armLeft", "armRight"] as const).flatMap((part, i) => {
            const arm = this.parts.get(part);
            if (!arm) return [];
            const side = i === 0 ? -1 : 1;
            arm.setVisible(true)
                .setAlpha(0)
                .setAngle(110 * side);
            this.track(
                tweens.add({
                    targets: arm,
                    angle: 0,
                    alpha: 1,
                    duration: 340,
                    ease: "Back.easeOut",
                }),
            );
            return [{ arm, side }];
        });
        this.later(340, () =>
            this.wave(440, (phase) =>
                arms.forEach(({ arm, side }) =>
                    arm.setAngle(
                        -14 * side * Math.sin(phase + (side + 1) * 0.4),
                    ),
                ),
            ),
        );

        this.wave(380, (phase) =>
            this.head
                .setAngle(7 * Math.sin(phase))
                .setY(-2 * Math.abs(Math.sin(phase))),
        );

        const hops = big ? 6 : 3;
        this.track(
            tweens.add({
                targets: this.rig,
                y: -26,
                duration: 220,
                ease: "Quad.easeOut",
                yoyo: true,
                repeat: hops - 1,
                onRepeat: () => this.squash(),
                onComplete: () => this.squash(),
            }),
        );
        if (big)
            this.track(
                tweens.add({
                    targets: this.rig,
                    angle: 360,
                    duration: 700,
                    ease: "Cubic.easeInOut",
                    onComplete: () => this.rig.setAngle(0),
                }),
            );

        this.burst(big ? 90 : 50);
        this.every(450, () => this.burst(26), big ? 6 : 3);
        this.every(big ? 700 : 900, () => this.cheer(), big ? 4 : 2, 120);
    }

    private squash() {
        this.track(
            this.scene.tweens.add({
                targets: this.rig,
                scaleX: { from: 1.08, to: 1 },
                scaleY: { from: 0.9, to: 1 },
                duration: 180,
                ease: "Quad.easeOut",
            }),
        );
    }

    private burst(count: number) {
        const x = this.x;
        const y = this.y + (this.rig.y - 80) * SCALE; // the top of the head
        this.confetti.explode(count, x, y);
        this.stars.explode(10, x, y);
    }

    private cheer() {
        floatText(
            this.scene,
            this.x - PhaserMath.Between(90, 170),
            this.y - PhaserMath.Between(110, 160),
            Utils.Array.GetRandom(CHEERS),
            Utils.Array.GetRandom(CHEER_COLORS),
        );
    }

    // --- Mood-scoped tweens and timers, all stopped when the mood changes --------------

    private track(tween: Tweens.Tween) {
        this.moodTweens.push(tween);
        return tween;
    }

    // Calls `update` with a phase running 0 → 2π once per `periodMs`, forever.
    private wave(periodMs: number, update: (phase: number) => void) {
        this.track(
            this.scene.tweens.addCounter({
                from: 0,
                to: Math.PI * 2,
                duration: periodMs,
                repeat: -1,
                onUpdate: (tween) => update(tween.getValue() ?? 0),
            }),
        );
    }

    private later(ms: number, callback: () => void) {
        this.moodTimers.push(this.scene.time.delayedCall(ms, callback));
    }

    // `times` calls (default: until the mood changes), the first after `delay`.
    private every(ms: number, callback: () => void, times = 0, delay = ms) {
        this.moodTimers.push(
            this.scene.time.addEvent({
                delay: ms,
                startAt: ms - delay,
                callback,
                ...(times ? { repeat: times - 1 } : { loop: true }),
            }),
        );
    }
}
