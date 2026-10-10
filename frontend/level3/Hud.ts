// Score, combo and multiplier on the left; thesis confidence, Eureka and the defense's
// progress on the right; banners for phases and combo milestones across the middle.

import { GameObjects } from "phaser";
import type { Scene } from "phaser";
import type { DefenseState } from "./engine";
import { CENTER_X, HUD_LEFT_X, HUD_RIGHT_X } from "./layout";
import { COLORS, FONT, MONO } from "./textures";
import { fill, TEXT } from "../src/misc/text";

const T = TEXT.thesisDefense.hud;

const BAR_W = 250;
const MULTIPLIER_COLORS = ["#ffffff", "#3ee0ff", "#ff4fd8", "#ffd84a"];

function text(
    scene: Scene,
    x: number,
    y: number,
    value: string,
    size: number,
    color = "#ffffff",
    font = FONT,
) {
    return scene.add
        .text(x, y, value, {
            fontFamily: font,
            fontSize: `${size}px`,
            fontStyle: "900",
            color,
            stroke: "#070b1f",
            strokeThickness: Math.max(3, size / 7),
        })
        .setOrigin(0.5)
        .setDepth(30);
}

export default class Hud {
    private readonly scene: Scene;
    private readonly score: GameObjects.Text;
    private readonly combo: GameObjects.Text;
    private readonly comboLabel: GameObjects.Text;
    private readonly multiplier: GameObjects.Text;
    private readonly accuracy: GameObjects.Text;
    private readonly bars: GameObjects.Graphics;
    private readonly eurekaHint: GameObjects.Text;
    private readonly banner: GameObjects.Text;
    private readonly bannerSub: GameObjects.Text;
    private readonly milestone: GameObjects.Text;
    private shown = { score: -1, combo: -1, multiplier: -1, accuracy: -1 };
    private shownScore = 0;

    constructor(scene: Scene) {
        this.scene = scene;
        const x = HUD_LEFT_X;
        text(scene, x, 262, T.score, 16, "#8fa2ff");
        this.score = text(scene, x, 296, "0", 40, "#ffffff", MONO);
        this.combo = text(scene, x - 20, 392, "", 72);
        this.comboLabel = text(scene, x - 20, 444, T.combo, 18, "#8fa2ff");
        this.multiplier = text(scene, x + 92, 380, "×1", 34);
        this.accuracy = text(scene, x, 500, "", 18, "#c9d3ff");

        const right = HUD_RIGHT_X;
        text(scene, right, 262, T.confidence, 16, "#8fa2ff");
        text(scene, right, 340, T.eureka, 16, "#ffd84a");
        text(scene, right, 418, T.progress, 14, "#8fa2ff");
        this.bars = scene.add.graphics().setDepth(30);
        this.eurekaHint = text(
            scene,
            right,
            384,
            T.pressSpace,
            18,
            "#ffd84a",
        ).setAlpha(0);
        scene.tweens.add({
            targets: this.eurekaHint,
            scale: 1.12,
            yoyo: true,
            repeat: -1,
            duration: 380,
        });

        this.banner = text(scene, CENTER_X, 330, "", 54)
            .setDepth(50)
            .setAlpha(0);
        this.bannerSub = text(scene, CENTER_X, 380, "", 20, "#c9d3ff")
            .setDepth(50)
            .setAlpha(0);
        // Milestones sit with the combo they celebrate, off the highway.
        this.milestone = text(scene, x, 556, "", 26, "#ffd84a")
            .setWordWrapWidth(300)
            .setDepth(50)
            .setAlpha(0);
    }

    reset() {
        this.shown = { score: -1, combo: -1, multiplier: -1, accuracy: -1 };
        this.shownScore = 0;
        for (const item of [this.banner, this.bannerSub, this.milestone]) {
            this.scene.tweens.killTweensOf(item);
            item.setAlpha(0);
        }
    }

    setVisible(isVisible: boolean) {
        for (const item of [
            this.score,
            this.combo,
            this.comboLabel,
            this.multiplier,
            this.accuracy,
            this.bars,
            this.eurekaHint,
            this.milestone,
        ])
            item.setVisible(isVisible);
    }

    update(
        state: DefenseState,
        accuracy: number,
        progress: number,
        time: number,
    ) {
        // The score counts up instead of jumping, which makes every hit feel heavier.
        this.shownScore += (state.score - this.shownScore) * 0.25;
        if (state.score - this.shownScore < 1) this.shownScore = state.score;
        const score = Math.round(this.shownScore);
        if (score !== this.shown.score) {
            this.shown.score = score;
            this.score.setText(score.toLocaleString("en-US"));
        }
        if (state.combo !== this.shown.combo) {
            const grew = state.combo > this.shown.combo;
            this.shown.combo = state.combo;
            this.combo.setText(state.combo >= 3 ? String(state.combo) : "");
            this.comboLabel.setAlpha(state.combo >= 3 ? 1 : 0.25);
            if (grew && state.combo >= 3) this.punch(this.combo, 1.18);
        }
        if (state.multiplier !== this.shown.multiplier) {
            this.shown.multiplier = state.multiplier;
            const base = state.eurekaActive
                ? state.multiplier / 2
                : state.multiplier;
            this.multiplier
                .setText(`×${state.multiplier}`)
                .setColor(
                    state.eurekaActive
                        ? "#ffd84a"
                        : MULTIPLIER_COLORS[Math.min(3, base - 1)],
                );
            this.punch(this.multiplier, 1.5);
        }
        const acc = Math.round(accuracy * 10);
        if (acc !== this.shown.accuracy) {
            this.shown.accuracy = acc;
            this.accuracy.setText(
                fill(T.accuracy, { accuracy: (acc / 10).toFixed(1) }),
            );
        }
        this.drawBars(state, progress, time);
        const ready = state.eureka >= 100 && !state.eurekaActive;
        this.eurekaHint.setAlpha(ready ? 1 : 0);
    }

    showPhase(title: string, subtitle: string, color: string) {
        this.flash(this.banner, title, color, 1300, 1.6);
        this.flash(this.bannerSub, subtitle, "#c9d3ff", 1300, 1);
    }

    showMilestone(title: string) {
        this.flash(this.milestone, title, "#ffd84a", 1400, 1.8);
    }

    private flash(
        item: GameObjects.Text,
        value: string,
        color: string,
        hold: number,
        from: number,
    ) {
        this.scene.tweens.killTweensOf(item);
        item.setText(value).setColor(color).setAlpha(1).setScale(from);
        this.scene.tweens.add({
            targets: item,
            scale: 1,
            duration: 260,
            ease: "Back.Out",
        });
        this.scene.tweens.add({
            targets: item,
            alpha: 0,
            delay: hold,
            duration: 300,
        });
    }

    private punch(item: GameObjects.Text, scale: number) {
        this.scene.tweens.killTweensOf(item);
        item.setScale(scale);
        this.scene.tweens.add({
            targets: item,
            scale: 1,
            duration: 160,
            ease: "Quad.Out",
        });
    }

    private drawBars(state: DefenseState, progress: number, time: number) {
        const g = this.bars;
        g.clear();
        const left = HUD_RIGHT_X - BAR_W / 2;
        const bar = (y: number, h: number, value: number, color: number) => {
            g.fillStyle(0x000000, 0.55);
            g.fillRoundedRect(left - 4, y - 4, BAR_W + 8, h + 8, (h + 8) / 2);
            if (value > 0) {
                g.fillStyle(color, 1);
                g.fillRoundedRect(
                    left,
                    y,
                    Math.max(h, BAR_W * value),
                    h,
                    h / 2,
                );
                g.fillStyle(0xffffff, 0.25);
                g.fillRoundedRect(
                    left + 4,
                    y + 2,
                    Math.max(0, BAR_W * value - 8),
                    h / 3,
                    h / 6,
                );
            }
        };
        const confidence = state.confidence / 100;
        const danger = state.confidence < 30;
        const pulse = danger ? 0.5 + 0.5 * Math.sin(time / 90) : 1;
        const color =
            confidence > 0.6
                ? 0x9dff4a
                : confidence > 0.3
                  ? 0xffb43c
                  : COLORS.red;
        g.setAlpha(1);
        bar(282, 26, confidence, color);
        if (danger) {
            g.lineStyle(3, COLORS.red, pulse);
            g.strokeRoundedRect(left - 6, 276, BAR_W + 12, 38, 19);
        }
        bar(
            358,
            16,
            state.eureka / 100,
            state.eurekaActive ? 0xffffff : COLORS.gold,
        );
        bar(436, 10, progress, 0x8fa2ff);
    }
}
