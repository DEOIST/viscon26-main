// The finger-gun shooter ("Basisprüfung", docs/GAME_DESIGN.md). Exam questions fly at the player
// with fake depth (depth.ts) down a dark corridor that reacts to every shot (Backdrop.ts); the
// player aims and shoots through the finger-detection engine or the mouse (input/). Phases: warm-up (three practice papers),
// countdown, a 60-second round, then the score. The juice is part of the feature.

import { Scene } from "phaser";
import Backdrop from "./Backdrop";
import { drawHandOverlay } from "./handOverlay";
import { glideAim } from "./glide";
import { floatText, muzzleFlash, shatter, textStyle } from "./effects";
import { pickLine } from "../src/games/shared/minigame";
import { fill, TEXT } from "../src/misc/text";
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import {
    APPROACH_SECONDS,
    COFFEE_BONUS_SECONDS,
    COUNTDOWN_SECONDS,
    PRACTICE_MAX_SECONDS,
    PRACTICE_POINTS,
    PRACTICE_RADIUS,
    ROUND_SECONDS,
    TARGET_RADIUS,
    type TargetKind,
} from "./config";
import { project } from "./depth";
import { hitTest } from "./hitTest";
import { shooterScore, shotPoints } from "./score";
import { pickTargetKind, spawnIntervalMs } from "./spawn";
import type { GameObjects } from "phaser";
import type { MinigameResult } from "../src/games/shared/minigame";
import type { AimPoint } from "./input/InputSource";
import type SwitchableInput from "./input/SwitchableInput";

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

type Phase = "practice" | "countdown" | "playing" | "over";

const T = TEXT.shooter;
const BUILT_IN_QUESTIONS = T.questions;
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
    private nextId = 1;
    private points = 0;
    private hits = 0;
    private shots = 0;
    private streak = 0;
    private secondsLeft = ROUND_SECONDS;
    private elapsedMs = 0;
    private nextSpawnMs = 0;
    private questionIndex = 0;
    private practiceIndex = 0;
    private practiceTarget: GameObjects.Container | null = null;
    private phase: Phase = "practice";
    private lastLine: string | undefined;
    private backdrop!: Backdrop;
    private overlay!: GameObjects.Graphics;
    private shownAim: AimPoint | null = null;
    private subtitle!: GameObjects.Text;
    private hud!: GameObjects.Text;
    private hint!: GameObjects.Text;
    private banner!: GameObjects.Text;

    constructor(args: ShooterSceneArgs) {
        super("shooter");
        this.args = args;
    }

    create() {
        this.backdrop = new Backdrop(this);
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
        this.say("intro", fill(T.intro, { name: this.args.playerName }));
        this.startPractice();
    }

    update(_time: number, delta: number) {
        const { input } = this.args;
        this.backdrop.update(delta, {
            streak: this.streak,
            isFinalStretch:
                this.phase === "playing" &&
                this.secondsLeft <= FINAL_STRETCH_SECONDS,
        });
        this.shownAim =
            input.mode === "camera"
                ? glideAim(this.shownAim, input.aim, delta)
                : input.aim;
        drawHandOverlay(this.overlay, input, this.shownAim);
        this.hint.setText(this.hintText());
        this.updateHud();
        const shots = this.args.input.takeShots(); // always drained, so none pile up
        if (this.phase === "practice") {
            for (const shot of shots)
                this.practiceShot(shot.x * GAME_WIDTH, shot.y * GAME_HEIGHT);
            return;
        }
        if (this.phase !== "playing") return;
        this.elapsedMs += delta;
        if (this.elapsedMs >= this.nextSpawnMs) this.spawn();
        this.moveTargets(delta);
        for (const shot of shots)
            this.shoot(shot.x * GAME_WIDTH, shot.y * GAME_HEIGHT);
    }

    private startPractice() {
        this.showPracticeTarget();
        // Never stuck in the warm-up: it ends by itself, or at once on Enter (the operator).
        this.time.delayedCall(PRACTICE_MAX_SECONDS * 1000, () =>
            this.endPractice(),
        );
        this.input.keyboard?.once("keydown-ENTER", () => this.endPractice());
    }

    private showPracticeTarget() {
        const point = PRACTICE_POINTS[this.practiceIndex];
        const disc = this.add
            .circle(0, 0, PRACTICE_RADIUS, PAPER, 0.9)
            .setStrokeStyle(6, 0xf2c14e);
        const label = this.add
            .text(
                0,
                0,
                fill(T.practiceTarget, {
                    current: this.practiceIndex + 1,
                    total: PRACTICE_POINTS.length,
                }),
                { ...textStyle(28, "#111318", "bold"), strokeThickness: 0 },
            )
            .setAlign("center")
            .setOrigin(0.5);
        this.practiceTarget = this.add
            .container(point.x * GAME_WIDTH, point.y * GAME_HEIGHT, [
                disc,
                label,
            ])
            .setDepth(1000);
        this.tweens.add({
            targets: this.practiceTarget,
            scale: 1.08,
            duration: 500,
            yoyo: true,
            repeat: -1,
        });
    }

    private practiceShot(x: number, y: number) {
        muzzleFlash(this, x, y);
        const target = this.practiceTarget;
        const isHit =
            target !== null &&
            Math.hypot(x - target.x, y - target.y) <=
                PRACTICE_RADIUS * target.scale;
        if (!target || !isHit) {
            this.backdrop.pulse(x, y, MISS_FLASH, 0.35);
            return;
        }
        this.backdrop.pulse(target.x, target.y, HIT_FLASH, 0.9);
        shatter(this, target.x, target.y, PAPER);
        this.removePracticeTarget();
        this.practiceIndex += 1;
        if (this.practiceIndex < PRACTICE_POINTS.length)
            this.showPracticeTarget();
        else this.endPractice();
    }

    private removePracticeTarget() {
        if (!this.practiceTarget) return;
        this.tweens.killTweensOf(this.practiceTarget);
        this.practiceTarget.destroy();
        this.practiceTarget = null;
    }

    private endPractice() {
        if (this.phase !== "practice") return;
        this.removePracticeTarget();
        this.phase = "countdown";
        this.startCountdown();
    }

    private startCountdown() {
        let remaining = COUNTDOWN_SECONDS;
        this.banner.setText(String(remaining));
        this.time.addEvent({
            delay: 1000,
            repeat: COUNTDOWN_SECONDS - 1,
            callback: () => {
                remaining -= 1;
                if (remaining > 0) {
                    this.banner.setText(String(remaining));
                    return;
                }
                this.banner.setText("");
                this.phase = "playing";
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
        if (this.secondsLeft === Math.floor(ROUND_SECONDS / 2))
            this.say("halfway", T.halfway);
        if (this.secondsLeft === FINAL_STRETCH_SECONDS)
            this.say("boss", T.finalStretch);
        if (this.secondsLeft <= 0) this.endRound();
    }

    private endRound() {
        this.phase = "over";
        this.banner.setText(T.pensDown);
        this.backdrop.pulse(GAME_WIDTH / 2, GAME_HEIGHT / 2, HIT_FLASH, 1);
        this.say("end", T.timeUp);
        this.time.delayedCall(1400, () =>
            this.args.finish({
                score: shooterScore(this.points),
                stats: {
                    points: this.points,
                    hits: this.hits,
                    shots: this.shots,
                },
            }),
        );
    }

    private spawn() {
        const progress = this.elapsedMs / (ROUND_SECONDS * 1000);
        this.nextSpawnMs = this.elapsedMs + spawnIntervalMs(progress);
        const kind = pickTargetKind(Math.random());
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
        if (kind === "deadline") {
            const card = this.add
                .rectangle(0, 0, 210, 120, TARGET_COLORS.deadline)
                .setStrokeStyle(4, 0xffffff);
            const label = this.add
                .text(0, 0, T.deadlineTarget, textStyle(30, "#ffffff", "bold"))
                .setOrigin(0.5)
                .setAlign("center");
            return this.add.container(0, 0, [card, label]);
        }
        if (kind === "coffee") {
            const cup = this.add
                .circle(0, 0, 64, TARGET_COLORS.coffee)
                .setStrokeStyle(4, 0xf5e6d3);
            const label = this.add
                .text(
                    0,
                    0,
                    fill(T.coffeeTarget, { seconds: COFFEE_BONUS_SECONDS }),
                    textStyle(30, "#ffffff", "bold"),
                )
                .setOrigin(0.5);
            return this.add.container(0, 0, [cup, label]);
        }
        const paper = this.add
            .rectangle(0, 0, 240, 150, PAPER)
            .setStrokeStyle(3, 0x1a1d24);
        const label = this.add
            .text(0, 0, this.nextQuestion(), {
                ...textStyle(24, "#111318"),
                strokeThickness: 0,
                wordWrap: { width: 210 },
                align: "center",
            })
            .setOrigin(0.5);
        const view = this.add.container(0, 0, [paper, label]);
        view.setRotation((Math.random() - 0.5) * 0.25);
        return view;
    }

    private nextQuestion(): string {
        const questions = this.args.dialogue?.questions?.length
            ? this.args.dialogue.questions
            : BUILT_IN_QUESTIONS;
        const question = questions[this.questionIndex % questions.length];
        this.questionIndex += 1;
        return question;
    }

    private moveTargets(delta: number) {
        for (const target of [...this.targets]) {
            target.z -= delta / 1000 / APPROACH_SECONDS[target.kind];
            if (target.z <= 0) {
                this.removeTarget(target, false); // it reached the player: gone, no penalty
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

    private shoot(x: number, y: number) {
        this.shots += 1;
        muzzleFlash(this, x, y);
        const hitId = hitTest(
            { x, y },
            this.targets.map((target) => ({
                id: target.id,
                x: target.view.x,
                y: target.view.y,
                radius: TARGET_RADIUS * target.view.scaleX,
                depth: target.view.depth,
            })),
        );
        const target = this.targets.find((candidate) => candidate.id === hitId);
        const gained = shotPoints(target?.kind ?? null, this.streak);
        this.points += gained;
        if (!target) {
            this.streak = 0;
            this.backdrop.pulse(x, y, MISS_FLASH, 0.45);
            floatText(this, x, y, `${gained}`, "#ff8a8a");
            if ((this.shots - this.hits) % 3 === 1) this.say("miss", T.miss);
            return;
        }
        this.hits += 1;
        this.streak += 1;
        this.backdrop.pulse(target.view.x, target.view.y, HIT_FLASH, 1);
        if (target.kind === "coffee") this.secondsLeft += COFFEE_BONUS_SECONDS;
        floatText(this, target.view.x, target.view.y, `+${gained}`, "#f2c14e");
        this.cameras.main.shake(90, 0.004);
        if (this.streak === 3 || this.streak % 6 === 0)
            this.say("streak", T.streak);
        this.removeTarget(target, true);
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
        if (this.phase === "practice") return T.hints.practice;
        return "";
    }

    private updateHud() {
        const { input } = this.args;
        const latency =
            input.latencyMs === null
                ? T.hud.latencyPending
                : fill(T.hud.latency, { ms: Math.round(input.latencyMs) });
        const device =
            input.mode === "camera"
                ? fill(T.hud.camera, { latency }) +
                  (input.recording ? T.hud.recording : "")
                : T.hud.mouse;
        this.hud.setText(
            fill(T.hud.status, {
                points: this.points,
                hits: this.hits,
                shots: this.shots,
                seconds: Math.max(0, this.secondsLeft),
                device,
            }),
        );
    }

    private say(event: string, fallback: string) {
        const line = pickLine(
            this.args.dialogue,
            event,
            fallback,
            this.lastLine,
        );
        this.lastLine = line;
        this.subtitle.setText(line);
    }
}
