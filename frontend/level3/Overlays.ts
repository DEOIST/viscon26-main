// The screens around a run: the title card, the countdown, the coffee-break pause and the
// verdict. Each is a container the scene shows and hides; buttons also answer the keyboard.

import { GameObjects } from "phaser";
import type { Scene } from "phaser";
import { LANE_CSS, LANE_GLYPHS, LANE_KEYS, LANE_NAMES } from "./config";
import type { DefenseState } from "./engine";
import { CENTER_X, HEIGHT, WIDTH } from "./layout";
import { FONT, MONO } from "./textures";
import type { BestRun, Verdict } from "./verdict";

const STAMP_MAX_W = 680;

export interface RunSummary {
    verdict: Verdict;
    failed: boolean;
    grade: number;
    accuracy: number;
    state: DefenseState;
    best: BestRun;
    isNewBest: boolean;
    submitted: boolean;
}

function label(
    scene: Scene,
    x: number,
    y: number,
    value: string,
    size: number,
    color = "#ffffff",
    weight = "900",
    font = FONT,
) {
    return scene.add
        .text(x, y, value, {
            fontFamily: font,
            fontSize: `${size}px`,
            fontStyle: weight,
            color,
            align: "center",
            stroke: "#070b1f",
            strokeThickness: Math.max(2, size / 8),
        })
        .setOrigin(0.5);
}

function panel(scene: Scene, w: number, h: number, y: number) {
    return [
        scene.add.rectangle(
            CENTER_X,
            HEIGHT / 2,
            WIDTH,
            HEIGHT,
            0x03050d,
            0.72,
        ),
        scene.add
            .rectangle(CENTER_X, y, w, h, 0x0b1233, 0.96)
            .setStrokeStyle(3, 0x3ee0ff, 0.8)
            .setRounded(26),
    ];
}

class KeyButton extends GameObjects.Container {
    private readonly face: GameObjects.Rectangle;
    private readonly text: GameObjects.Text;

    constructor(
        scene: Scene,
        x: number,
        y: number,
        value: string,
        color: number,
        onClick: () => void,
    ) {
        super(scene, x, y);
        this.face = scene.add
            .rectangle(0, 0, 290, 58, color, 1)
            .setRounded(16)
            .setInteractive({ useHandCursor: true });
        this.text = label(scene, 0, 0, value, 20, "#070b1f", "900").setStroke(
            "#000000",
            0,
        );
        this.add([this.face, this.text]);
        this.face.on("pointerdown", onClick);
        this.face.on("pointerover", () => this.setScale(1.05));
        this.face.on("pointerout", () => this.setScale(1));
    }

    setLabel(value: string, isEnabled: boolean) {
        this.text.setText(value);
        this.setAlpha(isEnabled ? 1 : 0.55);
        if (isEnabled) this.face.setInteractive({ useHandCursor: true });
        else this.face.disableInteractive();
    }
}

export default class Overlays {
    private readonly scene: Scene;
    private readonly title: GameObjects.Container;
    private readonly titleBest: GameObjects.Text;
    private readonly countdown: GameObjects.Text;
    private readonly pause: GameObjects.Container;
    private readonly results: GameObjects.Container;
    private readonly stamp: GameObjects.Text;
    private readonly verdictLine: GameObjects.Text;
    private readonly grade: GameObjects.Text;
    private readonly stats: GameObjects.Text;
    private readonly counts: GameObjects.Text;
    private readonly record: GameObjects.Text;
    private readonly submit: KeyButton;
    private shownCount = "";
    private failed = false;

    constructor(
        scene: Scene,
        onStart: () => void,
        onRetry: () => void,
        onSubmit: () => void,
    ) {
        this.scene = scene;
        this.title = this.makeTitle(onStart);
        this.titleBest = this.title.getByName("best") as GameObjects.Text;
        this.countdown = label(scene, CENTER_X, 420, "", 120, "#ffffff")
            .setDepth(90)
            .setAlpha(0);
        this.pause = scene.add
            .container(0, 0, [
                ...panel(scene, 560, 220, 400),
                label(scene, CENTER_X, 360, "COFFEE BREAK", 48, "#ffd84a"),
                label(
                    scene,
                    CENTER_X,
                    420,
                    "The committee waits. Impatiently.",
                    20,
                    "#c9d3ff",
                    "bold",
                ),
                label(
                    scene,
                    CENTER_X,
                    466,
                    "SPACE · CONTINUE      R · RESTART",
                    22,
                    "#3ee0ff",
                ),
            ])
            .setDepth(95)
            .setVisible(false);

        const [backdrop, card] = panel(scene, 760, 560, 392);
        this.stamp = label(scene, CENTER_X, 196, "", 58, "#ffd84a");
        this.verdictLine = label(
            scene,
            CENTER_X,
            256,
            "",
            19,
            "#c9d3ff",
            "bold",
        );
        this.grade = label(scene, CENTER_X, 306, "", 30, "#ffffff");
        this.stats = label(
            scene,
            CENTER_X,
            382,
            "",
            22,
            "#ffffff",
            "bold",
            MONO,
        ).setLineSpacing(8);
        this.counts = label(
            scene,
            CENTER_X,
            458,
            "",
            17,
            "#c9d3ff",
            "bold",
            MONO,
        );
        this.record = label(scene, CENTER_X, 500, "", 20, "#ffd84a");
        const retry = new KeyButton(
            scene,
            CENTER_X - 160,
            584,
            "R · DEFEND AGAIN",
            0x3ee0ff,
            onRetry,
        );
        this.submit = new KeyButton(
            scene,
            CENTER_X + 160,
            584,
            "ENTER · SUBMIT THESIS",
            0x9dff4a,
            onSubmit,
        );
        this.results = scene.add
            .container(0, 0, [
                backdrop,
                card,
                label(
                    scene,
                    CENTER_X,
                    140,
                    "THE COMMITTEE HAS REACHED A VERDICT",
                    16,
                    "#8fa2ff",
                    "bold",
                ),
                this.stamp,
                this.verdictLine,
                this.grade,
                this.stats,
                this.counts,
                this.record,
                retry,
                this.submit,
            ])
            .setDepth(95)
            .setVisible(false);
    }

    showTitle(best: BestRun | null) {
        this.titleBest.setText(
            best
                ? `PERSONAL BEST  ${best.score.toLocaleString("en-US")}  ·  ${best.accuracy.toFixed(1)}%  ·  ${best.maxCombo} COMBO`
                : "NO PERSONAL BEST YET. MAKE HISTORY.",
        );
        this.title.setVisible(true);
    }

    hideTitle() {
        this.title.setVisible(false);
    }

    // `left` is the countdown's remaining ms; returns nothing, just draws the right number.
    updateCountdown(left: number) {
        const value =
            left > 1600 ? "3" : left > 800 ? "2" : left > 0 ? "1" : "DEFEND!";
        if (left < -600) {
            this.countdown.setAlpha(0);
            this.shownCount = "";
            return;
        }
        if (value === this.shownCount) return;
        this.shownCount = value;
        this.countdown
            .setText(value)
            .setColor(value === "DEFEND!" ? "#ffd84a" : "#ffffff")
            .setFontSize(value === "DEFEND!" ? 96 : 140)
            .setAlpha(1)
            .setScale(1.8);
        this.scene.tweens.killTweensOf(this.countdown);
        this.scene.tweens.add({
            targets: this.countdown,
            scale: 1,
            duration: 220,
            ease: "Back.Out",
        });
        this.scene.tweens.add({
            targets: this.countdown,
            alpha: 0,
            delay: 520,
            duration: 240,
        });
    }

    hideCountdown() {
        this.scene.tweens.killTweensOf(this.countdown);
        this.countdown.setAlpha(0);
        this.shownCount = "";
    }

    showPause(isVisible: boolean) {
        this.pause.setVisible(isVisible);
    }

    showResults(summary: RunSummary) {
        const { verdict, state } = summary;
        // Long verdicts shrink to fit the card instead of spilling over its edge.
        this.stamp
            .setFontSize(58)
            .setText(verdict.title)
            .setColor(verdict.color);
        if (this.stamp.width > STAMP_MAX_W)
            this.stamp.setFontSize(
                Math.floor((58 * STAMP_MAX_W) / this.stamp.width),
            );
        this.verdictLine.setText(verdict.line);
        this.grade.setText(`ETH GRADE  ${summary.grade.toFixed(2)}`);
        this.stats.setText(
            [
                `SCORE      ${state.score.toLocaleString("en-US").padStart(9)}`,
                `ACCURACY   ${`${summary.accuracy.toFixed(1)}%`.padStart(9)}`,
                `MAX COMBO  ${String(state.maxCombo).padStart(9)}`,
            ].join("\n"),
        );
        const c = state.counts;
        this.counts.setText(
            `PERFECT ${c.perfect}   GREAT ${c.great}   GOOD ${c.good}   MISS ${c.miss}`,
        );
        this.record.setText(
            summary.isNewBest
                ? "★ NEW PERSONAL BEST ★"
                : `PERSONAL BEST  ${summary.best.score.toLocaleString("en-US")}`,
        );
        this.failed = summary.failed;
        this.setSubmitted(summary.submitted);
        this.results.setVisible(true);
        // The verdict lands like a rubber stamp.
        this.stamp.setScale(3).setAlpha(0).setAngle(-8);
        this.scene.tweens.add({
            targets: this.stamp,
            scale: 1,
            alpha: 1,
            angle: -3,
            duration: 360,
            delay: 250,
            ease: "Back.In",
            onComplete: () => this.scene.cameras.main.shake(180, 0.008),
        });
        if (summary.isNewBest)
            this.scene.tweens.add({
                targets: this.record,
                scale: 1.12,
                yoyo: true,
                repeat: -1,
                duration: 420,
            });
    }

    setSubmitted(isSubmitted: boolean) {
        this.submit.setLabel(
            isSubmitted
                ? "THESIS SUBMITTED ✓"
                : this.failed
                  ? "ENTER · SUBMIT ANYWAY"
                  : "ENTER · SUBMIT THESIS",
            !isSubmitted,
        );
    }

    hideResults() {
        this.scene.tweens.killTweensOf([this.stamp, this.record]);
        this.record.setScale(1);
        this.results.setVisible(false);
    }

    private makeTitle(onStart: () => void) {
        const scene = this.scene;
        const items: GameObjects.GameObject[] = [
            ...panel(scene, 820, 430, 450),
            label(
                scene,
                CENTER_X,
                270,
                "YEAR 3 · THE FINAL BOSS",
                16,
                "#8fa2ff",
                "bold",
            ),
            label(
                scene,
                CENTER_X,
                316,
                "THESIS DEFENSE",
                64,
                "#ffffff",
            ).setShadow(0, 0, "#3ee0ff", 18, true, true),
            label(
                scene,
                CENTER_X,
                368,
                "Questions fly at you. Press the lane's key as each one hits the line.",
                19,
                "#c9d3ff",
                "bold",
            ),
        ];
        LANE_KEYS.forEach((key, lane) => {
            const x = CENTER_X + (lane - 1.5) * 180;
            items.push(
                scene.add
                    .rectangle(x, 440, 150, 92, 0x070b1f, 1)
                    .setStrokeStyle(3, parseInt(LANE_CSS[lane].slice(1), 16))
                    .setRounded(16),
                label(
                    scene,
                    x,
                    424,
                    `${key}  ${LANE_GLYPHS[lane]}`,
                    30,
                    LANE_CSS[lane],
                ),
                label(
                    scene,
                    x,
                    462,
                    LANE_NAMES[lane].toUpperCase(),
                    13,
                    "#c9d3ff",
                    "bold",
                ),
            );
        });
        const hint = label(
            scene,
            CENTER_X,
            522,
            "★ Golden questions fill EUREKA. Then SPACE doubles your points.",
            18,
            "#ffd84a",
            "bold",
        );
        const best = label(
            scene,
            CENTER_X,
            556,
            "",
            15,
            "#8fa2ff",
            "bold",
        ).setName("best");
        const start = label(
            scene,
            CENTER_X,
            612,
            "PRESS SPACE TO BEGIN THE DEFENSE",
            26,
            "#3ee0ff",
        );
        start
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", onStart);
        scene.tweens.add({
            targets: start,
            alpha: 0.35,
            yoyo: true,
            repeat: -1,
            duration: 650,
        });
        items.push(hint, best, start);
        return scene.add.container(0, 0, items).setDepth(95).setVisible(false);
    }
}
