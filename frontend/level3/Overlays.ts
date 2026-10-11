// The pages around a run, set on the same sheet of paper: the thesis title page (with the key
// table) before a defense, the ETH transcript with the committee's red rubber stamp after
// it, the countdown that typesets \begin{defense}, and the viewer's coffee-break pause.

import type { GameObjects, Scene } from "phaser";
import {
    GOLD_INK,
    LANE_COLORS,
    LANE_GLYPHS,
    LANE_KEYS,
    LANE_NAMES,
} from "./config";
import type { DefenseState } from "./engine";
import { BLEED, COLUMN, HEIGHT, PAGE, WIDTH } from "./layout";
import {
    COLORS,
    CSS,
    MONO,
    TEXT,
    drawStamp,
    hand,
    penCircle,
    penLine,
    serif,
} from "./textures";
import type { BestRun, Verdict } from "./verdict";
import { fill, TEXT as COPY_TEXT } from "../src/misc/text";
import type { TimingLean } from "./latency";

const COPY = COPY_TEXT.thesisDefense;

export interface RunSummary {
    verdict: Verdict;
    failed: boolean;
    grade: number;
    accuracy: number;
    state: DefenseState;
    best: BestRun;
    isNewBest: boolean;
    submitted: boolean;
    timing: TimingLean | null; // how this run's hits leaned, when it's worth tuning
}

type Style = "normal" | "bold" | "italic";

const CX = PAGE.x + PAGE.w / 2;
const SHEET_TOP = 100; // below the running header
const FIGURE_CX = COLUMN.x + COLUMN.w / 2;
const TABLE_W = 480;

const points = (value: number) => value.toLocaleString("de-CH");

export default class Overlays {
    private readonly scene: Scene;
    private readonly playerName: string;
    private readonly title: GameObjects.Container;
    private readonly titleBest: GameObjects.Text;
    private readonly countdown: GameObjects.Text;
    private readonly pause: GameObjects.Container;
    private readonly results: GameObjects.Container;
    private readonly parts: Record<string, GameObjects.Text>;
    private readonly stamp: GameObjects.Image;
    private readonly recordInk: GameObjects.Graphics;
    private readonly submitLabel: GameObjects.Text;
    private shownCount = "";
    private stamps = 0;

    constructor(
        scene: Scene,
        playerName: string,
        onStart: () => void,
        onRetry: () => void,
        onSubmit: () => void,
    ) {
        this.scene = scene;
        this.playerName = playerName || COPY.defaultName;
        this.title = this.makeTitle(onStart);
        this.titleBest = this.title.getByName("best") as GameObjects.Text;
        this.countdown = scene.add
            .text(FIGURE_CX, 380, "", serif(150, CSS.ink, "bold"))
            .setOrigin(0.5)
            .setDepth(60)
            .setAlpha(0);
        this.pause = this.makePause();

        // The transcript.
        const t = (
            x: number,
            y: number,
            size: number,
            color = CSS.ink,
            style: Style = "normal",
        ) => scene.add.text(x, y, "", serif(size, color, style));
        this.parts = {
            name: t(COLUMN.x, 128, 30, CSS.ink, "bold"),
            grade: t(
                COLUMN.x + TABLE_W - 10,
                236,
                46,
                CSS.ink,
                "bold",
            ).setOrigin(1, 0),
            ects: t(COLUMN.x + 330, 248, 20).setOrigin(1, 0),
            remark: t(COLUMN.x, 304, 17, CSS.ink, "italic").setWordWrapWidth(
                TABLE_W,
            ),
            career: t(COLUMN.x, 366, 16, CSS.inkSoft).setWordWrapWidth(TABLE_W),
            stats: t(COLUMN.x, 446, 17),
            counts: t(COLUMN.x, 476, 15, CSS.inkSoft),
            best: t(COLUMN.x, 516, 16, CSS.ink, "italic"),
            // Narrow, so it stays clear of the stamp landing on the right.
            timing: t(
                COLUMN.x,
                552,
                14,
                CSS.inkSoft,
                "italic",
            ).setWordWrapWidth(300),
        };
        const rules = scene.add.graphics();
        rules.lineStyle(1.4, COLORS.ink, 1);
        rules.lineBetween(COLUMN.x, 210, COLUMN.x + TABLE_W, 210);
        rules.lineBetween(COLUMN.x, 296, COLUMN.x + TABLE_W, 296);
        rules.lineBetween(COLUMN.x, 432, COLUMN.x + TABLE_W, 432);
        rules.lineBetween(COLUMN.x, 500, COLUMN.x + TABLE_W, 500);
        rules.lineStyle(0.7, COLORS.ink, 1);
        rules.lineBetween(COLUMN.x, 232, COLUMN.x + TABLE_W, 232);
        const fixed = [
            scene.add.text(
                COLUMN.x,
                168,
                COPY.transcript.degree,
                serif(15, CSS.inkSoft, "italic"),
            ),
            scene.add.text(
                COLUMN.x,
                214,
                COPY.transcript.course,
                serif(14, CSS.ink, "bold"),
            ),
            scene.add
                .text(
                    COLUMN.x + 330,
                    214,
                    COPY.transcript.ects,
                    serif(14, CSS.ink, "bold"),
                )
                .setOrigin(1, 0),
            scene.add
                .text(
                    COLUMN.x + TABLE_W - 10,
                    214,
                    COPY.transcript.grade,
                    serif(14, CSS.ink, "bold"),
                )
                .setOrigin(1, 0),
            scene.add.text(
                COLUMN.x,
                250,
                COPY.transcript.courseName,
                serif(20),
            ),
            scene.add.text(
                COLUMN.x,
                410,
                COPY.transcript.tableCaption,
                serif(14),
            ),
            // The institution signs the transcript at its foot, like the real one.
            scene.add.text(
                COLUMN.x,
                688,
                COPY.transcript.footer,
                serif(12, CSS.inkSoft, "italic"),
            ),
        ];
        this.recordInk = scene.add.graphics();
        // The committee's rubber stamp: an inked texture, redrawn for every verdict.
        drawStamp(scene, "THESIS DEFENDED", 1);
        this.stamp = scene.add.image(0, 0, "td-stamp").setAlpha(0);
        // Actions, deliberately unequal: revising is safe and quiet, submitting is final.
        const revise = this.keyAction(
            COLUMN.x,
            640,
            "R",
            COPY.transcript.revise,
            17,
            CSS.inkSoft,
            onRetry,
        );
        const submitRight = PAGE.x + PAGE.w - 48;
        const submitX = submitRight - 340;
        const divider = scene.add.graphics();
        divider.lineStyle(1.4, COLORS.ink, 1);
        divider.lineBetween(submitX, 624, submitRight, 624);
        const submit = this.keyAction(
            submitX,
            638,
            "Enter",
            COPY.transcript.submit,
            23,
            CSS.ink,
            onSubmit,
            true,
        );
        this.submitLabel = submit.label;
        this.results = scene.add
            .container(0, 0, [
                this.sheet(),
                rules,
                ...fixed,
                ...Object.values(this.parts),
                this.recordInk,
                divider,
                ...revise.parts,
                ...submit.parts,
                this.stamp,
            ])
            .setDepth(50)
            .setVisible(false);
    }

    showTitle(best: BestRun | null) {
        this.titleBest.setText(
            best
                ? fill(COPY.titlePage.best, {
                      score: points(best.score),
                      accuracy: best.accuracy.toFixed(1),
                      combo: best.maxCombo,
                  })
                : COPY.titlePage.noBest,
        );
        this.title.setVisible(true);
    }

    hideTitle() {
        this.title.setVisible(false);
    }

    // Returns the value it just started showing ("3", "2", "1", "DEFEND!"), or null.
    updateCountdown(left: number): string | null {
        const value =
            left > 1600 ? "3" : left > 800 ? "2" : left > 0 ? "1" : "DEFEND!";
        if (left < -600) {
            this.countdown.setAlpha(0);
            this.shownCount = "";
            return null;
        }
        if (value === this.shownCount) return null;
        this.shownCount = value;
        const isGo = value === "DEFEND!";
        this.countdown
            .setText(isGo ? COPY.countdownGo : value)
            .setStyle(
                isGo
                    ? {
                          fontFamily: MONO,
                          resolution: TEXT.resolution,
                          fontSize: "46px",
                          fontStyle: "normal",
                          color: CSS.ink,
                      }
                    : serif(150, CSS.ink, "bold"),
            )
            .setAlpha(1)
            .setScale(isGo ? 1.1 : 1.35);
        this.scene.tweens.killTweensOf(this.countdown);
        this.scene.tweens.add({
            targets: this.countdown,
            scale: 1,
            duration: 200,
            ease: "Cubic.Out",
        });
        this.scene.tweens.add({
            targets: this.countdown,
            alpha: 0,
            delay: 540,
            duration: 220,
        });
        return value;
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
        const p = this.parts;
        const passed = summary.grade >= 4 && !summary.failed;
        p.name.setText(this.playerName);
        p.grade
            .setText(summary.grade.toFixed(2))
            .setColor(passed ? CSS.ink : CSS.redPen);
        p.ects.setText(summary.failed ? "(60)" : "60");
        p.remark.setText(verdict.line);
        p.career
            .setText(fill(COPY.transcript.career, { career: verdict.career }))
            .setY(p.remark.y + p.remark.height + 8);
        const c = state.counts;
        p.stats.setText(
            fill(COPY.transcript.stats, {
                score: points(state.score),
                accuracy: summary.accuracy.toFixed(1),
                combo: state.maxCombo,
            }),
        );
        p.counts.setText(fill(COPY.transcript.counts, { ...c }));
        const timing = summary.timing;
        p.timing.setText(
            timing
                ? fill(
                      timing.lean > 0
                          ? COPY.transcript.timingLate
                          : COPY.transcript.timingEarly,
                      { ms: Math.abs(timing.lean) },
                  )
                : "",
        );
        p.best.setText(
            summary.isNewBest
                ? COPY.transcript.newBest
                : fill(COPY.transcript.best, {
                      score: points(summary.best.score),
                  }),
        );
        this.recordInk.clear();
        if (summary.isNewBest) {
            this.recordInk.lineStyle(2.4, COLORS.redPen, 0.9);
            penCircle(
                this.recordInk,
                p.best.x + p.best.width / 2,
                p.best.y + 11,
                p.best.width / 2 + 16,
                18,
                4,
            );
        }
        const { lines } = drawStamp(
            this.scene,
            verdict.title,
            ++this.stamps * 7 + summary.grade * 4,
        );
        // A one-line verdict is shorter, so it can land bigger in the same space.
        const stampScale = lines === 1 ? 0.68 : 0.52;
        // Stamped low on the right, so the remarks and the career forecast stay readable.
        // Clear of Table 2 above and the submit rule below, measured on the rotated frame.
        this.stamp.setPosition(PAGE.x + PAGE.w - 180, 540);
        this.setSubmitted(summary.submitted);
        this.results.setVisible(true);
        // The stamp lands: big and tilted, then down with a thud (sound in the scene).
        this.stamp.setScale(1.6).setAlpha(0).setAngle(-15);
        this.scene.tweens.add({
            targets: this.stamp,
            scale: stampScale,
            alpha: 0.88,
            angle: -9,
            duration: 300,
            delay: 310,
            ease: "Cubic.In",
            onComplete: () => this.scene.cameras.main.shake(140, 0.006),
        });
    }

    // The player pressed C on the transcript: say what the timing is tuned to now.
    showTuned(offset: number): string {
        const text = fill(COPY.transcript.timingTuned, {
            offset: offset > 0 ? `+${offset}` : String(offset),
        });
        this.parts.timing.setText(text);
        return text;
    }

    setSubmitted(isSubmitted: boolean) {
        this.submitLabel.setText(
            isSubmitted ? COPY.transcript.submitted : COPY.transcript.submit,
        );
        this.submitLabel.setColor(isSubmitted ? CSS.inkSoft : CSS.ink);
    }

    hideResults() {
        this.scene.tweens.killTweensOf(this.stamp);
        this.results.setVisible(false);
    }

    private sheet() {
        const h = HEIGHT + BLEED - SHEET_TOP;
        return this.scene.add.rectangle(
            PAGE.x + PAGE.w / 2,
            SHEET_TOP + h / 2,
            PAGE.w,
            h,
            COLORS.paper,
        );
    }

    private makeTitle(onStart: () => void) {
        const scene = this.scene;
        const items: GameObjects.GameObject[] = [this.sheet()];
        const add = (
            y: number,
            text: string,
            size: number,
            color = CSS.ink,
            style: Style = "normal",
        ) => {
            const item = scene.add
                .text(CX, y, text, serif(size, color, style))
                .setOrigin(0.5, 0);
            items.push(item);
            return item;
        };
        add(128, COPY.titlePage.title, 64, CSS.ink, "bold");
        add(208, COPY.titlePage.subtitle, 20, CSS.ink, "italic");
        add(252, fill(COPY.titlePage.author, { name: this.playerName }), 19);
        add(278, COPY.titlePage.department, 15, CSS.inkSoft);
        add(300, COPY.titlePage.examiners, 15, CSS.inkSoft);

        // Table 1, booktabs style: the key bindings.
        const left = CX - 230;
        const right = CX + 230;
        add(344, COPY.titlePage.tableCaption, 14);
        const rules = scene.add.graphics();
        rules.lineStyle(1.4, COLORS.ink, 1);
        rules.lineBetween(left, 368, right, 368);
        rules.lineBetween(left, 552, right, 552);
        rules.lineStyle(0.7, COLORS.ink, 1);
        rules.lineBetween(left, 394, right, 394);
        items.push(rules);
        const cell = (
            x: number,
            y: number,
            text: string,
            style: Style = "normal",
        ) => {
            const item = scene.add.text(x, y, text, serif(17, CSS.ink, style));
            items.push(item);
            return item;
        };
        const [keyHead, answerHead, notationHead] = COPY.titlePage.tableHead;
        cell(left + 14, 371, keyHead, "bold");
        cell(left + 96, 371, answerHead, "bold");
        cell(right - 110, 371, notationHead, "bold");
        const rows: [string, string, string, number][] = LANE_KEYS.map(
            (key, lane) => [
                key,
                LANE_NAMES[lane],
                LANE_GLYPHS[lane],
                LANE_COLORS[lane],
            ],
        );
        rows.push(["Space", COPY.titlePage.eurekaRow, "×2", GOLD_INK]);
        rows.forEach(([key, what, glyph, ink], i) => {
            const y = 402 + i * 29;
            items.push(
                scene.add
                    .image(left + 34, y + 12, `td-marker-${i % 3}`)
                    .setTint(ink)
                    .setDisplaySize(key.length > 1 ? 66 : 40, 26),
            );
            cell(left + 34 - (key.length > 1 ? 24 : 6), y, key, "bold");
            cell(left + 96, y, what);
            cell(right - 110, y, glyph);
        });

        const start = scene.add
            .text(CX, 584, COPY.titlePage.start, serif(28, CSS.ink, "bold"))
            .setOrigin(0.5, 0)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", onStart);
        const caret = scene.add.rectangle(
            start.x + start.width / 2 + 10,
            602,
            3,
            30,
            COLORS.ink,
        );
        scene.tweens.add({
            targets: caret,
            alpha: 0,
            yoyo: true,
            repeat: -1,
            duration: 520,
            hold: 260,
        });
        const underline = scene.add.graphics();
        underline.lineStyle(2.4, COLORS.redPen, 0.9);
        penLine(
            underline,
            start.x - start.width / 2,
            624,
            start.x + start.width / 2,
            620,
            1.2,
            9,
        );
        const best = scene.add
            .text(CX, 640, "", serif(15, CSS.inkSoft, "italic"))
            .setOrigin(0.5, 0)
            .setName("best");
        const note = scene.add
            .text(
                PAGE.x + PAGE.w - 56,
                318,
                COPY.titlePage.luck,
                hand(22, CSS.redPen),
            )
            .setOrigin(1, 0)
            .setAngle(-6);
        items.push(start, caret, underline, best, note);
        return scene.add.container(0, 0, items).setDepth(50).setVisible(false);
    }

    private makePause() {
        const scene = this.scene;
        const box = scene.add.graphics();
        box.fillStyle(0x000000, 0.35).fillRect(
            -BLEED,
            -BLEED,
            WIDTH + 2 * BLEED,
            HEIGHT + 2 * BLEED,
        );
        box.fillStyle(COLORS.toolbar, 0.97).fillRoundedRect(
            WIDTH / 2 - 250,
            300,
            500,
            150,
            10,
        );
        return scene.add
            .container(0, 0, [
                box,
                scene.add
                    .text(
                        WIDTH / 2,
                        324,
                        COPY.pause.title,
                        serif(32, CSS.chrome, "bold"),
                    )
                    .setOrigin(0.5, 0),
                scene.add
                    .text(
                        WIDTH / 2,
                        370,
                        COPY.pause.subtitle,
                        serif(17, CSS.chromeMuted, "italic"),
                    )
                    .setOrigin(0.5, 0),
                scene.add
                    .text(
                        WIDTH / 2,
                        408,
                        COPY.pause.keys,
                        serif(16, CSS.chrome),
                    )
                    .setOrigin(0.5, 0),
            ])
            .setDepth(95)
            .setVisible(false);
    }

    // A key cap and its action, both clickable.
    private keyAction(
        x: number,
        y: number,
        key: string,
        text: string,
        size: number,
        color: string,
        onClick: () => void,
        isPrimary = false,
    ) {
        const scene = this.scene;
        const cap = scene.add.text(
            x + 10,
            y + (size - 17) / 2,
            key,
            serif(17, color, "bold"),
        );
        const frame = scene.add.graphics();
        frame.lineStyle(
            isPrimary ? 1.8 : 1.2,
            isPrimary ? COLORS.ink : 0x555555,
            1,
        );
        frame.strokeRoundedRect(x, cap.y - 4, cap.width + 20, 30, 5);
        frame.lineStyle(3, COLORS.ink, 0.25);
        frame.lineBetween(x + 3, cap.y + 28, x + cap.width + 17, cap.y + 28);
        const label = scene.add.text(
            x + cap.width + 32,
            y,
            text,
            serif(size, color, isPrimary ? "bold" : "normal"),
        );
        for (const item of [cap, label])
            item.setInteractive({ useHandCursor: true }).on(
                "pointerdown",
                onClick,
            );
        return { parts: [frame, cap, label], label };
    }
}
