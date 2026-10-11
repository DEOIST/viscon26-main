// Bug Bash: pinch and throw bugs, slap burning fuses, and swat rare side interruptions.
// Calibration and practice lead into a 60-second coding round.

import { Scene } from "phaser";
import ShooterAudio, { loadShooterAudio } from "./audio";
import Backdrop from "./Backdrop";
import SlapWalkers from "./SlapWalkers";
import { makeBug, makeCodeBomb, drawFuse } from "./CodeTargets";
import { drawHandOverlay } from "./handOverlay";
import { floatText, muzzleFlash, shatter, textStyle } from "./effects";
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import {
    GRAB_TRACKING_GRACE_MS,
    GRAB_RADIUS_MULTIPLIER,
    THROW_FLIGHT_MS,
    THROW_MIN_DISTANCE,
    THROW_MIN_SPEED,
    THROW_MOTION_WINDOW_MS,
    APPROACH_SECONDS,
    BUG_MISSED_PENALTY,
    CODE_LOST_PENALTY,
    CODE_SWIPE_RADIUS,
    FUSE_SWIPE_RADIUS,
    INTERRUPTER_POINTS,
    COUNTDOWN_SECONDS,
    PRACTICE_MAX_SECONDS,
    PRACTICE_POINTS,
    PRACTICE_RADIUS,
    ROUND_SECONDS,
    TARGET_RADIUS,
    type TargetKind,
} from "./config";
import { project } from "./depth";
import { swipeHits } from "./swipeHit";
import type { CvSlide } from "./input/cvStream";
import { hitTest } from "./hitTest";
import { addPoints, shooterScore, shotPoints } from "./score";
import { pickTargetKind, spawnIntervalMs } from "./spawn";
import { TriggerCalibration } from "./triggerCalibration";
import type { GameObjects, Time } from "phaser";
import type { MinigameResult } from "../src/games/shared/minigame";
import { fill, TEXT } from "../src/misc/text";
import type { AimPoint } from "./input/InputSource";
import type SwitchableInput from "./input/SwitchableInput";

const T = TEXT.shooter;

interface ShooterSceneArgs {
    playerName: string;
    dialogue: Record<string, string[]> | null;
    input: SwitchableInput;
    targetScale: number; // Gamer perk
    finish(result: MinigameResult): void;
}

interface Target {
    id: number;
    kind: TargetKind;
    laneX: number;
    nearY: number;
    z: number; // 1 = far away, 0 = at the player
    view: GameObjects.Container;
}

interface HeldObject {
    target: Target | null; // null for the warm-up paper
    view: GameObjects.Container;
    origin: AimPoint;
    samples: { x: number; y: number; t: number }[];
    lostMs: number;
    mode: "camera" | "mouse";
}

type Phase = "trigger" | "practice" | "countdown" | "playing" | "over";

const PAPER = 0xfdfcf7;
const HIT_FLASH = 0xf2c14e;
const MISS_FLASH = 0xff4d4d;
const START_FLASH = 0xffffff;
const FINAL_STRETCH_SECONDS = 10;
const TARGET_COLORS: Record<TargetKind, number> = {
    question: PAPER,
    deadline: 0xe5484d,
    coffee: 0x8b5a2b,
};

export default class ShooterScene extends Scene {
    private readonly args: ShooterSceneArgs;
    private targets: Target[] = [];
    private held: HeldObject | null = null;
    private nextId = 1;
    private points = 0;
    private hits = 0;
    private shots = 0;
    private streak = 0;
    private secondsLeft = ROUND_SECONDS;
    private elapsedMs = 0;
    private nextSpawnMs = 0;
    private savedCode = 0;
    private practiceIndex = 0;
    private practiceTarget: GameObjects.Container | null = null;
    private practiceTimer: Time.TimerEvent | null = null;
    private trigger: TriggerCalibration | null = null;
    private phase: Phase = "practice";
    private backdrop!: Backdrop;
    private slapWalkers!: SlapWalkers;
    private overlay!: GameObjects.Graphics;
    private subtitle!: GameObjects.Text;
    private hud!: GameObjects.Text;
    private hint!: GameObjects.Text;
    private banner!: GameObjects.Text;
    private instruction!: GameObjects.Text;
    private audio!: ShooterAudio;

    constructor(args: ShooterSceneArgs) {
        super("shooter");
        this.args = args;
    }

    preload() {
        loadShooterAudio(this);
    }

    create() {
        this.audio = new ShooterAudio(this);
        this.audio.startMusic();
        const canvas = this.game.canvas;
        const previousCursor = canvas.style.cursor;
        canvas.style.cursor = "none";
        this.events.once("shutdown", () => {
            canvas.style.cursor = previousCursor;
        });
        this.addFullscreenControl();
        this.backdrop = new Backdrop(this);
        this.slapWalkers = new SlapWalkers(this);
        this.overlay = this.add.graphics().setDepth(2000);
        this.subtitle = this.add
            .text(GAME_WIDTH / 2, 20, "", textStyle(30, "#f5f5f5"))
            .setOrigin(0.5, 0)
            .setDepth(2001);
        this.hud = this.add
            .text(24, GAME_HEIGHT - 52, "", textStyle(28, "#f2c14e"))
            .setDepth(2001);
        this.hint = this.add
            .text(
                GAME_WIDTH / 2,
                GAME_HEIGHT - 110,
                "",
                textStyle(26, "#ffffff"),
            )
            .setOrigin(0.5)
            .setDepth(2001);
        this.banner = this.add
            .text(
                GAME_WIDTH / 2,
                GAME_HEIGHT / 2,
                "",
                textStyle(130, "#f2c14e", "bold"),
            )
            .setOrigin(0.5)
            .setDepth(2002);
        this.instruction = this.add
            .text(
                GAME_WIDTH / 2,
                GAME_HEIGHT * 0.3,
                "",
                textStyle(44, "#f2c14e", "bold"),
            )
            .setOrigin(0.5)
            .setAlign("center")
            .setWordWrapWidth(GAME_WIDTH * 0.8)
            .setDepth(2002);
        this.subtitle.setText(fill(T.intro, { name: this.args.playerName }));
        // Mouse/keyboard fallback for the same slap action.
        this.input.keyboard?.on("keydown-SPACE", () => {
            if (this.phase === "playing") this.handleSlap("right");
        });
        // T runs the trigger check again, but only before the round starts
        this.input.keyboard?.on("keydown-T", () => {
            if (this.phase === "practice") this.restartTriggerCalibration();
        });
        if (this.args.input.mode === "camera") this.startTriggerCalibration();
        else this.startPractice();
    }

    private addFullscreenControl() {
        const button = this.add
            .text(
                GAME_WIDTH - 18,
                65,
                T.fullscreen.enter,
                textStyle(15, "#c5d8ef"),
            )
            .setOrigin(1, 0)
            .setDepth(2003)
            .setInteractive({ useHandCursor: true });
        const toggle = () => {
            if (this.scale.isFullscreen) this.scale.stopFullscreen();
            else this.scale.startFullscreen();
        };
        const updateLabel = () =>
            button.setText(
                this.scale.isFullscreen
                    ? T.fullscreen.exit
                    : T.fullscreen.enter,
            );
        const failed = () =>
            floatText(
                this,
                GAME_WIDTH / 2,
                130,
                T.fullscreen.unavailable,
                "#ffc1a1",
            );
        const key = (event: KeyboardEvent) => {
            const element = event.target as HTMLElement | null;
            if (
                event.repeat ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                element?.isContentEditable ||
                element?.tagName === "INPUT" ||
                element?.tagName === "TEXTAREA"
            )
                return;
            event.preventDefault();
            toggle();
        };
        button.on("pointerdown", toggle);
        this.input.keyboard?.on("keydown-F", key);
        this.scale.on("enterfullscreen", updateLabel);
        this.scale.on("leavefullscreen", updateLabel);
        this.scale.on("fullscreenfailed", failed);
        this.scale.on("fullscreennotsupported", failed);
        this.events.once("shutdown", () => {
            this.input.keyboard?.off("keydown-F", key);
            this.scale.off("enterfullscreen", updateLabel);
            this.scale.off("leavefullscreen", updateLabel);
            this.scale.off("fullscreenfailed", failed);
            this.scale.off("fullscreennotsupported", failed);
            if (this.scale.isFullscreen) this.scale.stopFullscreen();
        });
    }

    update(_time: number, delta: number) {
        const { input } = this.args;
        this.backdrop.update(delta, {
            streak: this.streak,
            isAdvancing: this.phase === "playing",
            isFinalStretch:
                this.phase === "playing" &&
                this.secondsLeft <= FINAL_STRETCH_SECONDS,
        });
        if (this.phase === "playing") this.slapWalkers.update(delta);
        drawHandOverlay(this.overlay, input, null);
        this.hint.setText(this.hintText());
        this.updateHud();
        const shots = this.args.input.takeShots(); // always drained, so none pile up
        for (const side of input.takeSlaps()) {
            if (this.phase === "playing") this.handleSlap(side);
        }
        for (const slide of input.takeSlides()) {
            if (this.phase === "playing")
                this.handleSlap(slide.direction, slide);
        }
        if (this.phase === "trigger") {
            this.updateTriggerCalibration(delta, shots);
            return;
        }
        if (this.phase === "practice") {
            this.updateHeld(delta);
            for (const shot of shots)
                this.grab(shot.x * GAME_WIDTH, shot.y * GAME_HEIGHT);
            return;
        }
        if (this.phase !== "playing") return;
        this.elapsedMs += delta;
        if (this.elapsedMs >= this.nextSpawnMs) this.spawn();
        this.moveTargets(delta);
        this.updateHeld(delta);
        for (const shot of shots)
            this.grab(shot.x * GAME_WIDTH, shot.y * GAME_HEIGHT);
    }

    private startTriggerCalibration() {
        this.phase = "trigger";
        this.trigger = new TriggerCalibration();
        // Never stuck here either: Enter skips to the warm-up with the trigger as it is.
        this.input.keyboard?.once("keydown-ENTER", () => {
            this.trigger?.skip();
        });
    }

    private updateTriggerCalibration(delta: number, shots: AimPoint[]) {
        const { input } = this.args;
        const trigger = this.trigger;
        if (!trigger) return;
        if (input.mode !== "camera") trigger.skip(); // switched to the mouse
        for (const reply of input.takeTriggerReplies())
            trigger.handleReply(reply);
        const step = trigger.update(delta, input.tracking === "ok");
        if (step) {
            input.calibrateTrigger(step);
            this.audio.play(step === "done" ? "calibOk" : "calibStep", 0.45);
        }
        for (const shot of shots) {
            if (!trigger.handleShot()) continue; // shots only count in the test
            const x = shot.x * GAME_WIDTH;
            const y = shot.y * GAME_HEIGHT;
            this.audio.play("calibOk", 0.42);
            muzzleFlash(this, x, y);
            floatText(this, x, y, T.callouts.grab, "#f2c14e");
            this.backdrop.pulse(x, y, HIT_FLASH, 0.6);
        }
        this.instruction.setText(trigger.instruction());
        if (!trigger.isFinished) return;
        // Enter may skip while samples are being collected: end the server's collection too.
        if (trigger.usedDefault && input.mode === "camera")
            input.calibrateTrigger("done");
        this.instruction.setText("");
        this.audio.play(trigger.usedDefault ? "calibFail" : "calibDone", 0.58);
        if (trigger.usedDefault && input.mode === "camera")
            floatText(
                this,
                GAME_WIDTH / 2,
                GAME_HEIGHT * 0.3,
                T.defaultPinch,
                "#ffffff",
            );
        this.trigger = null;
        this.startPractice();
    }

    private restartTriggerCalibration() {
        if (this.args.input.mode !== "camera") return;
        this.removePracticeTarget();
        this.practiceTimer?.remove();
        this.practiceTimer = null;
        this.practiceIndex = 0;
        this.startTriggerCalibration();
    }

    private startPractice() {
        this.phase = "practice";
        this.showPracticeTarget();
        // Never stuck in the warm-up: it ends by itself, or at once on Enter (the operator).
        this.practiceTimer = this.time.delayedCall(
            PRACTICE_MAX_SECONDS * 1000,
            () => this.endPractice(),
        );
        this.input.keyboard?.once("keydown-ENTER", () => this.endPractice());
    }

    private showPracticeTarget() {
        this.audio.play("practicePop", 0.4);
        const point = PRACTICE_POINTS[this.practiceIndex];
        this.practiceTarget = makeBug(this)
            .setPosition(point.x * GAME_WIDTH, point.y * GAME_HEIGHT)
            .setDepth(1000);
        this.instruction.setText(
            fill(T.practiceTarget, {
                current: this.practiceIndex + 1,
                total: PRACTICE_POINTS.length,
            }),
        );
        this.tweens.add({
            targets: this.practiceTarget,
            scale: 1.08,
            duration: 500,
            yoyo: true,
            repeat: -1,
        });
    }

    private removePracticeTarget() {
        if (this.held?.view === this.practiceTarget) this.held = null;
        if (!this.practiceTarget) return;
        this.tweens.killTweensOf(this.practiceTarget);
        this.practiceTarget.destroy();
        this.practiceTarget = null;
    }

    private endPractice() {
        if (this.phase !== "practice") return;
        this.removePracticeTarget();
        this.instruction.setText("");
        this.phase = "countdown";
        this.startCountdown();
    }

    private startCountdown() {
        this.subtitle.setText(T.roundStart);
        let remaining = COUNTDOWN_SECONDS;
        this.banner.setText(String(remaining));
        this.audio.play("countTick", 0.5);
        this.time.addEvent({
            delay: 1000,
            repeat: COUNTDOWN_SECONDS - 1,
            callback: () => {
                remaining -= 1;
                if (remaining > 0) {
                    this.banner.setText(String(remaining));
                    this.audio.play(
                        remaining === 1 ? "countLast" : "countTick",
                        0.54,
                    );
                    return;
                }
                this.banner.setText("");
                this.phase = "playing";
                this.audio.play("go", 0.68);
                this.backdrop.pulse(
                    GAME_WIDTH / 2,
                    GAME_HEIGHT / 2,
                    START_FLASH,
                    1,
                );
                this.time.addEvent({
                    delay: 1000,
                    loop: true,
                    callback: () => this.tick(),
                });
            },
        });
    }

    private tick() {
        if (this.phase !== "playing") return;
        this.secondsLeft -= 1;
        if (this.secondsLeft === Math.floor(ROUND_SECONDS / 2)) {
            this.subtitle.setText(T.halfway);
            this.audio.play("halfway", 0.48);
        }
        if (this.secondsLeft === FINAL_STRETCH_SECONDS) {
            this.subtitle.setText(T.finalStretch);
            this.audio.play("countLast", 0.48);
        }
        if (this.secondsLeft <= 0) this.endRound();
    }

    private endRound() {
        this.held = null;
        this.phase = "over";
        this.banner.setText(T.buildComplete);
        this.audio.stopHeldLoop();
        this.audio.play("roundEnd", 0.62);
        this.backdrop.pulse(GAME_WIDTH / 2, GAME_HEIGHT / 2, HIT_FLASH, 1);
        this.subtitle.setText(T.shiftComplete);
        this.time.delayedCall(1400, () =>
            this.args.finish({
                score: shooterScore(this.points),
                stats: {
                    points: this.points,
                    hits: this.hits,
                    shots: this.shots,
                    savedCode: this.savedCode,
                    interruptions: this.slapWalkers.knockedOut,
                },
            }),
        );
    }

    private spawn() {
        const progress = this.elapsedMs / (ROUND_SECONDS * 1000);
        this.nextSpawnMs = this.elapsedMs + spawnIntervalMs(progress);
        const kind = pickTargetKind(Math.random());
        this.audio.play(kind === "deadline" ? "practicePop" : "bugSpawn", 0.28);
        this.targets.push({
            id: this.nextId++,
            kind,
            laneX: 0.12 + Math.random() * 0.76,
            nearY: 0.6 + Math.random() * 0.26,
            z: 1,
            view: this.makeView(kind),
        });
    }

    private makeView(kind: TargetKind): GameObjects.Container {
        return kind === "deadline" ? makeCodeBomb(this) : makeBug(this);
    }

    private handleSlap(side: "left" | "right", slide?: CvSlide) {
        const knockedOut = this.slapWalkers.slap(side, slide);
        this.audio.play(knockedOut ? "walkerSlap" : "slapWhiff", 0.46);
        if (knockedOut)
            this.points = addPoints(this.points, INTERRUPTER_POINTS);
        const burning = this.targets.filter((target) => {
            if (target.kind !== "deadline") return false;
            if (!slide) return true;
            const { x, y, scaleX, scaleY } = target.view;
            const fire = target.view.getData("fire") as AimPoint | undefined;
            return (
                swipeHits(slide, x, y, CODE_SWIPE_RADIUS * scaleX) ||
                (!!fire &&
                    swipeHits(
                        slide,
                        x + fire.x * scaleX,
                        y + fire.y * scaleY,
                        FUSE_SWIPE_RADIUS * scaleX,
                    ))
            );
        });
        for (const target of burning) {
            this.targets = this.targets.filter(
                (candidate) => candidate !== target,
            );
            const fuse = target.view.getData("fuse") as GameObjects.Graphics;
            fuse.clear();
            this.audio.play("fuseOut", 0.54);
            this.savedCode += 1;
            const gained = shotPoints("deadline", this.streak);
            this.points = addPoints(this.points, gained);
            this.streak += 1;
            floatText(
                this,
                target.view.x,
                target.view.y - 70,
                fill(T.callouts.codeSaved, { points: gained }),
                "#9ff3c6",
            );
            this.tweens.add({
                targets: target.view,
                y: target.view.y - 60,
                alpha: 0,
                delay: 250,
                duration: 400,
                onComplete: () => target.view.destroy(),
            });
        }
        if (burning.length || knockedOut)
            this.backdrop.pulse(GAME_WIDTH / 2, GAME_HEIGHT / 2, 0x76d8ad, 0.7);
    }

    private moveTargets(delta: number) {
        for (const target of [...this.targets]) {
            if (target === this.held?.target) continue;
            target.z -= delta / 1000 / APPROACH_SECONDS[target.kind];
            if (target.z <= 0) {
                const isCode = target.kind === "deadline";
                const penalty = isCode ? CODE_LOST_PENALTY : BUG_MISSED_PENALTY;
                this.points = addPoints(this.points, -penalty);
                this.streak = 0;
                floatText(
                    this,
                    target.view.x,
                    target.view.y,
                    fill(
                        isCode ? T.callouts.codeCrashed : T.callouts.bugEscaped,
                        { points: penalty },
                    ),
                    "#ff8a8a",
                );
                if (isCode) {
                    this.audio.play("bomb", 0.58);
                    shatter(this, target.view.x, target.view.y, 0xff862c);
                    this.cameras.main.shake(160, 0.006);
                    this.backdrop.pulse(
                        target.view.x,
                        target.view.y,
                        MISS_FLASH,
                        1,
                    );
                }
                if (!isCode) this.audio.play("bugEscape", 0.44);
                this.removeTarget(target, false);
                continue;
            }
            if (target.kind === "deadline") {
                target.view
                    .setPosition(
                        (0.27 + target.laneX * 0.59) * GAME_WIDTH,
                        (0.26 + (target.nearY - 0.6) * 1.2) * GAME_HEIGHT,
                    )
                    .setScale(0.82)
                    .setAlpha(1)
                    .setDepth(1100);
                drawFuse(target.view, 1 - target.z, this.time.now);
                continue;
            }
            const view = project(target.laneX, target.nearY, target.z);
            target.view
                .setPosition(view.x * GAME_WIDTH, view.y * GAME_HEIGHT)
                .setScale(view.scale * this.args.targetScale)
                .setAlpha(view.alpha)
                .setDepth(view.depth);
        }
    }

    private grab(x: number, y: number) {
        if (this.held) return;
        if (this.phase === "practice") {
            const view = this.practiceTarget;
            if (
                !view ||
                Math.hypot(x - view.x, y - view.y) >
                    PRACTICE_RADIUS * view.scaleX * GRAB_RADIUS_MULTIPLIER
            )
                return;
            this.hold(view, null, x, y);
            return;
        }
        this.shots += 1;
        const hitId = hitTest(
            { x, y },
            this.targets
                .filter((target) => target.kind !== "deadline")
                .map((target) => ({
                    id: target.id,
                    x: target.view.x,
                    y: target.view.y,
                    radius:
                        TARGET_RADIUS *
                        target.view.scaleX *
                        GRAB_RADIUS_MULTIPLIER,
                    depth: target.view.depth,
                })),
        );
        const target = this.targets.find((candidate) => candidate.id === hitId);
        if (!target) {
            const gained = shotPoints(null, this.streak);
            this.points = addPoints(this.points, gained);
            this.streak = 0;
            this.audio.play("grabMiss", 0.45);
            floatText(this, x, y, T.callouts.nothingGrabbed, "#ff8a8a");
            return;
        }
        this.hold(target.view, target, x, y);
    }

    private hold(
        view: GameObjects.Container,
        target: Target | null,
        x: number,
        y: number,
    ) {
        this.tweens.killTweensOf(view);
        view.setPosition(x, y).setAlpha(1).setDepth(1900);
        this.held = {
            view,
            target,
            origin: { x, y },
            samples: [{ x, y, t: this.time.now }],
            lostMs: 0,
            mode: this.args.input.mode,
        };
        this.audio.play("grab", 0.54);
        this.audio.startHeldLoop();
        floatText(this, x, y - 80, T.callouts.grabbed, "#f2c14e");
    }

    private handPoint(): AimPoint | null {
        const input = this.args.input;
        const hand = input.landmarks;
        if (input.mode === "camera" && hand)
            return {
                x: ((hand[4].x + hand[8].x) * GAME_WIDTH) / 2,
                y: ((hand[4].y + hand[8].y) * GAME_HEIGHT) / 2,
            };
        return input.aim
            ? { x: input.aim.x * GAME_WIDTH, y: input.aim.y * GAME_HEIGHT }
            : null;
    }

    private updateHeld(delta: number) {
        const held = this.held;
        if (!held) return;
        const input = this.args.input;
        if (input.mode !== held.mode) {
            this.dropHeld();
            return;
        }
        if (input.tracking !== "ok") {
            held.lostMs += delta;
            if (held.lostMs >= GRAB_TRACKING_GRACE_MS) this.dropHeld();
            return;
        }
        held.lostMs = 0;
        const point = this.handPoint();
        if (point) {
            held.view.setPosition(point.x, point.y);
            held.samples.push({ ...point, t: this.time.now });
            while (
                held.samples.length > 2 &&
                held.samples[1].t < this.time.now - THROW_MOTION_WINDOW_MS
            )
                held.samples.shift();
        }
        if (input.pinching) return;
        const first = held.samples[0];
        const last = held.samples[held.samples.length - 1];
        let dx = last.x - first.x;
        let dy = last.y - first.y;
        const speed =
            Math.hypot(dx, dy) / Math.max((last.t - first.t) / 1000, 0.001);
        const travelX = last.x - held.origin.x;
        const travelY = last.y - held.origin.y;
        if (
            speed < THROW_MIN_SPEED &&
            Math.hypot(travelX, travelY) < THROW_MIN_DISTANCE
        ) {
            this.dropHeld();
            return;
        }
        if (Math.hypot(dx, dy) < 5) {
            dx = travelX;
            dy = travelY;
        }
        this.throwHeld(dx, dy);
    }

    private dropHeld() {
        const held = this.held;
        if (!held) return;
        this.held = null;
        this.audio.stopHeldLoop();
        this.audio.play("drop", 0.38);
        if (!held.target) {
            const point = PRACTICE_POINTS[this.practiceIndex];
            held.view
                .setPosition(point.x * GAME_WIDTH, point.y * GAME_HEIGHT)
                .setDepth(1000);
        }
        // Live targets resume their approach on the next frame.
    }

    private throwHeld(dx: number, dy: number) {
        const held = this.held;
        if (!held) return;
        this.held = null;
        this.audio.stopHeldLoop();
        const target = held.target;
        this.audio.play(target ? "throw" : "practicePop", 0.58);
        if (target) {
            this.targets = this.targets.filter(
                (candidate) => candidate !== target,
            );
            const gained = shotPoints(target.kind, this.streak);
            this.points = addPoints(this.points, gained);
            this.hits += 1;
            this.streak += 1;
            floatText(
                this,
                held.view.x,
                held.view.y,
                fill(T.callouts.bugSquashed, { points: gained }),
                "#f2c14e",
            );
            if (this.streak === 3 || this.streak % 6 === 0) {
                this.subtitle.setText(T.streak);
                this.audio.play("streak", 0.5);
            }
        } else {
            this.practiceTarget = null;
            this.practiceIndex += 1;
        }
        this.backdrop.pulse(held.view.x, held.view.y, HIT_FLASH, 0.8);
        const length = Math.hypot(dx, dy) || 1;
        const flight = GAME_WIDTH + GAME_HEIGHT;
        this.tweens.add({
            targets: held.view,
            x: held.view.x + (dx / length) * flight,
            y: held.view.y + (dy / length) * flight,
            angle: held.view.angle + (dx < 0 ? -360 : 360),
            scale: 0.15,
            alpha: 0,
            duration: THROW_FLIGHT_MS,
            ease: "Quad.easeIn",
            onComplete: () => held.view.destroy(),
        });
        if (!target) {
            if (this.practiceIndex < PRACTICE_POINTS.length)
                this.showPracticeTarget();
            else this.endPractice();
        }
    }

    private removeTarget(target: Target, isHit: boolean) {
        this.targets = this.targets.filter((candidate) => candidate !== target);
        if (isHit)
            shatter(
                this,
                target.view.x,
                target.view.y,
                TARGET_COLORS[target.kind],
            );
        target.view.destroy();
    }

    private hintText(): string {
        const { input } = this.args;
        if (input.mode === "mouse" && input.notice) return input.notice;
        if (input.mode === "camera" && input.tracking === "calibrating")
            return T.hints.calibrating;
        if (input.mode === "camera" && input.tracking === "noPose")
            return T.hints.noPose;
        if (input.mode === "camera" && input.tracking === "lost")
            return T.hints.lost;
        if (this.phase === "trigger") return T.hints.skipPinchCheck;
        if (this.held) return T.hints.holding;
        if (this.phase === "practice") return T.hints.practice;
        if (this.phase === "playing")
            return input.mode === "mouse"
                ? T.hints.playingMouse
                : T.hints.playingCamera;
        return "";
    }

    private updateHud() {
        const { input } = this.args;
        this.hud.setText(
            fill(T.hud.status, {
                points: this.points,
                bugs: this.hits,
                saved: this.savedCode,
                dodged: this.slapWalkers.knockedOut,
                seconds: Math.max(0, this.secondsLeft),
                device: input.mode === "mouse" ? T.hud.mouse : T.hud.camera,
            }),
        );
    }
}
