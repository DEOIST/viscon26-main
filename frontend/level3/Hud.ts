// The PDF viewer around the thesis page: the toolbar (file name, page counter as progress,
// sound and fullscreen), the thumbnail sidebar (one page per phase of the defense) and the
// properties pane (soundtrack, timing ruler, keys). On the paper itself: the running header,
// the section heading of the current phase, the confidence and Eureka highlighter bars and
// Table 3.1, the defense's numbers set like any other table in the thesis.

import type { GameObjects, Scene } from "phaser";
import { LANE_COLORS, WINDOWS } from "./config";
import type { DefenseState } from "./engine";
import {
    BLEED,
    COLUMN,
    MARGIN,
    PAGE,
    PANEL_X,
    SIDEBAR_W,
    TOOLBAR_H,
    WIDTH,
} from "./layout";
import { COLORS, CSS, MONO, hand, penCircle, serif } from "./textures";

const PAGES = 58; // the thesis' length, for the page counter
const SECTIONS = ["Opening", "Cross-exam.", "Meltdown", "Final"];
const THUMB = { w: 92, h: 118, gap: 34, top: 74 } as const;
const BAR_W = MARGIN.w - 34;
const RIGHT = MARGIN.x + MARGIN.w - 14; // right edge of the margin's table
const CHROME = 0xf1f3f4;

export interface HudActions {
    onFullscreen(): void;
    onMute(): void;
}

type Visible = GameObjects.Components.Visible;

export default class Hud {
    private readonly scene: Scene;
    private readonly pageNumber: GameObjects.Text;
    private readonly folio: GameObjects.Text;
    private readonly heading: GameObjects.Text[];
    private readonly score: GameObjects.Text;
    private readonly combo: GameObjects.Text;
    private readonly multiplier: GameObjects.Text;
    private readonly accuracy: GameObjects.Text;
    private readonly confidence: GameObjects.Text;
    private readonly frames: GameObjects.Graphics;
    private readonly confidenceInk: GameObjects.Image;
    private readonly eurekaInk: GameObjects.Image;
    private readonly eurekaHint: GameObjects.Container;
    private readonly meter: GameObjects.Graphics;
    private readonly nowPlaying: GameObjects.Text;
    private readonly sound: GameObjects.Text;
    private readonly thumbs: GameObjects.Graphics;
    private readonly playParts: Visible[];
    private readonly ticks: { delta: number; at: number }[] = [];
    private section = -1;
    private shown = {
        score: -1,
        combo: -1,
        multiplier: -1,
        accuracy: -1,
        page: -1,
    };
    private shownScore = 0;

    constructor(scene: Scene, playerName: string, actions: HudActions) {
        this.scene = scene;
        this.drawViewer();
        this.thumbs = scene.add.graphics().setDepth(1);
        SECTIONS.forEach((name, i) =>
            scene.add
                .text(
                    SIDEBAR_W / 2,
                    THUMB.top + i * (THUMB.h + THUMB.gap) + THUMB.h + 9,
                    `3.${i + 1}  ${name}`,
                    serif(13, CSS.chrome),
                )
                .setOrigin(0.5, 0)
                .setDepth(1),
        );

        // Toolbar, drawn past the right edge so an expanded fullscreen canvas stays chrome.
        const bar = scene.add.graphics().setDepth(40);
        bar.fillStyle(COLORS.toolbar, 1).fillRect(
            0,
            -BLEED,
            WIDTH + BLEED,
            TOOLBAR_H + BLEED,
        );
        bar.lineStyle(2, CHROME, 1);
        for (const y of [15, 22, 29]) bar.lineBetween(18, y, 34, y);
        scene.add
            .text(52, TOOLBAR_H / 2, "thesis_FINAL_v7_really_final.pdf", {
                fontFamily: MONO,
                fontSize: "15px",
                color: CSS.chrome,
            })
            .setOrigin(0, 0.5)
            .setDepth(41);
        bar.fillStyle(0x191b1c, 1).fillRect(WIDTH / 2 - 54, 11, 42, 22);
        this.pageNumber = scene.add
            .text(WIDTH / 2 - 33, TOOLBAR_H / 2, "1", serif(15, CSS.chrome))
            .setOrigin(0.5)
            .setDepth(41);
        scene.add
            .text(
                WIDTH / 2 - 2,
                TOOLBAR_H / 2,
                `/  ${PAGES}`,
                serif(15, CSS.chromeMuted),
            )
            .setOrigin(0, 0.5)
            .setDepth(41);
        this.sound = scene.add
            .text(WIDTH - 124, TOOLBAR_H / 2, "", serif(14, CSS.chrome))
            .setOrigin(1, 0.5)
            .setDepth(41);
        this.drawSpeaker(bar, WIDTH - 104, TOOLBAR_H / 2);
        scene.add
            .text(WIDTH - 54, TOOLBAR_H / 2, "F", serif(14, CSS.chromeMuted))
            .setOrigin(1, 0.5)
            .setDepth(41);
        this.drawFullscreenIcon(bar, WIDTH - 32, TOOLBAR_H / 2);
        this.button(WIDTH - 214, 0, 128, TOOLBAR_H, actions.onMute);
        this.button(WIDTH - 72, 0, 72, TOOLBAR_H, actions.onFullscreen);

        // Running header and section heading on the paper.
        scene.add
            .text(
                COLUMN.x,
                80,
                `${playerName || "Candidate"} · Master Thesis · ETH Zürich`.toUpperCase(),
                { ...serif(12, CSS.inkSoft), letterSpacing: 1.5 },
            )
            .setOrigin(0, 0.5)
            .setDepth(2);
        this.folio = scene.add
            .text(PAGE.x + PAGE.w - 40, 80, "1", serif(13))
            .setOrigin(1, 0.5)
            .setDepth(2);
        const rule = scene.add.graphics().setDepth(2);
        rule.lineStyle(0.8, COLORS.ink, 1);
        rule.lineBetween(COLUMN.x, 94, PAGE.x + PAGE.w - 40, 94);
        this.heading = [
            scene.add.text(COLUMN.x, 108, "", serif(28, CSS.ink, "bold")),
            scene.add.text(COLUMN.x + 58, 108, "", serif(28, CSS.ink, "bold")),
            scene.add.text(COLUMN.x, 144, "", serif(16, CSS.inkSoft, "italic")),
        ].map((t) => t.setDepth(2));

        // Properties pane (viewer chrome): soundtrack, timing ruler, keys.
        const px = PANEL_X + 24;
        const field = (y: number, text: string) =>
            scene.add
                .text(px, y, text.toUpperCase(), {
                    ...serif(12, CSS.chromeMuted),
                    letterSpacing: 1.6,
                })
                .setDepth(2);
        field(68, "Soundtrack");
        this.nowPlaying = scene.add
            .text(px, 88, "Silence, until you begin.", {
                ...serif(15, CSS.chrome, "italic"),
                wordWrap: { width: WIDTH - px - 18 },
                lineSpacing: 3,
            })
            .setDepth(2);
        field(196, "Timing");
        scene.add
            .text(px, 260, "early", serif(12, CSS.chromeMuted, "italic"))
            .setDepth(2);
        scene.add
            .text(WIDTH - 24, 260, "late", serif(12, CSS.chromeMuted, "italic"))
            .setOrigin(1, 0)
            .setDepth(2);
        this.meter = scene.add.graphics().setDepth(2);
        field(296, "Keys");
        const keys: [string, string][] = [
            ["D F J K", "answer"],
            ["Space", "start, Eureka"],
            ["Esc", "pause"],
            ["R", "revise"],
            ["M", "sound"],
            ["F", "fullscreen"],
        ];
        keys.forEach(([key, what], i) =>
            this.keyHint(px, 324 + i * 32, key, what),
        );

        // Margin: confidence and Eureka as highlighter bars.
        const label = (y: number, text: string) =>
            scene.add
                .text(MARGIN.x + 12, y, text, {
                    ...serif(12, CSS.inkSoft),
                    letterSpacing: 1.4,
                })
                .setDepth(8);
        this.confidence = label(402, "");
        this.frames = scene.add.graphics().setDepth(8);
        this.confidenceInk = scene.add
            .image(MARGIN.x + 12, 435, "td-marker-2")
            .setOrigin(0, 0.5)
            .setDepth(8);
        const eurekaLabel = label(462, "EUREKA");
        this.eurekaInk = scene.add
            .image(MARGIN.x + 12, 491, "td-marker-0")
            .setOrigin(0, 0.5)
            .setTint(COLORS.gold)
            .setDepth(8);
        const ring = scene.add.graphics();
        ring.lineStyle(2.2, COLORS.redPen, 1);
        penCircle(ring, 0, 0, 50, 21, 5);
        this.eurekaHint = scene.add
            .container(RIGHT - 52, 491, [
                ring,
                scene.add
                    .text(0, 0, "Space!", hand(24, CSS.redPen, true))
                    .setOrigin(0.5),
            ])
            .setDepth(9)
            .setAlpha(0);
        scene.tweens.add({
            targets: this.eurekaHint,
            scale: 1.08,
            yoyo: true,
            repeat: -1,
            duration: 360,
        });

        // Table 3.1: the numbers, set in the margin like every other table in the thesis.
        const table = scene.add.graphics().setDepth(8);
        table.lineStyle(1.3, COLORS.ink, 1);
        table.lineBetween(MARGIN.x + 12, 546, RIGHT, 546);
        table.lineBetween(MARGIN.x + 12, 690, RIGHT, 690);
        table.lineStyle(0.6, COLORS.ink, 1);
        table.lineBetween(MARGIN.x + 12, 610, RIGHT, 610);
        const cell = (y: number, text: string) =>
            scene.add.text(MARGIN.x + 12, y, text, serif(15)).setDepth(8);
        const caption = scene.add
            .text(
                MARGIN.x + 12,
                522,
                "Table 3.1: The defense so far.",
                serif(13),
            )
            .setDepth(8);
        const rows = [
            cell(554, "Score"),
            cell(582, "Accuracy"),
            cell(620, "Combo"),
        ];
        this.score = scene.add
            .text(RIGHT, 550, "0", serif(22, CSS.ink, "bold"))
            .setOrigin(1, 0)
            .setDepth(8);
        this.accuracy = scene.add
            .text(RIGHT, 580, "", serif(17))
            .setOrigin(1, 0)
            .setDepth(8);
        this.combo = scene.add
            .text(RIGHT, 612, "0", serif(64, CSS.ink, "bold"))
            .setOrigin(1, 0)
            .setDepth(8);
        this.multiplier = scene.add
            .text(MARGIN.x + 12, 648, "", serif(28, CSS.ink, "italic"))
            .setDepth(8);
        this.playParts = [
            this.confidence,
            this.frames,
            this.confidenceInk,
            eurekaLabel,
            this.eurekaInk,
            this.eurekaHint,
            table,
            caption,
            ...rows,
            this.score,
            this.accuracy,
            this.combo,
            this.multiplier,
            ...this.heading,
        ];
        this.drawThumbs();
    }

    reset() {
        this.shown = {
            score: -1,
            combo: -1,
            multiplier: -1,
            accuracy: -1,
            page: -1,
        };
        this.shownScore = 0;
        this.ticks.length = 0;
        this.meter.clear();
        this.setSection(-1, "", "");
    }

    // The margin's live parts only belong to a running defense; the title page and the
    // transcript hide them.
    setPlaying(isPlaying: boolean) {
        for (const part of this.playParts) part.setVisible(isPlaying);
    }

    setSection(index: number, title: string, subtitle: string) {
        this.section = index;
        this.drawThumbs();
        const [number, name, line] = this.heading;
        number.setText(index < 0 ? "" : `3.${index + 1}`);
        name.setText(title);
        line.setText(subtitle);
        if (index < 0) return;
        // The heading sets itself like a fresh page: a quick fade up.
        for (const t of this.heading) {
            this.scene.tweens.killTweensOf(t);
            t.setAlpha(0);
            this.scene.tweens.add({
                targets: t,
                alpha: 1,
                duration: 260,
                ease: "Cubic.Out",
            });
        }
    }

    setNowPlaying(value: string) {
        this.nowPlaying.setText(value);
    }

    setSound(isMuted: boolean) {
        this.sound.setText(isMuted ? "M  sound off" : "M  sound on");
    }

    addTick(delta: number) {
        this.ticks.push({ delta, at: this.scene.time.now });
        if (this.ticks.length > 14) this.ticks.shift();
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
            this.score.setText(score.toLocaleString("de-CH"));
        }
        if (state.combo !== this.shown.combo) {
            const grew = state.combo > this.shown.combo;
            this.shown.combo = state.combo;
            this.combo.setText(String(state.combo));
            if (grew && state.combo >= 3) this.punch(this.combo, 1.12);
        }
        if (state.multiplier !== this.shown.multiplier) {
            this.shown.multiplier = state.multiplier;
            // Eureka's doubled multiplier is the one yellow on the table.
            this.multiplier
                .setText(`×${state.multiplier}`)
                .setColor(state.eurekaActive ? "#b89a00" : CSS.ink);
            this.punch(this.multiplier, 1.4);
        }
        const acc = Math.round(accuracy * 10);
        if (acc !== this.shown.accuracy) {
            this.shown.accuracy = acc;
            this.accuracy.setText(`${(acc / 10).toFixed(1)} %`);
        }
        const page =
            1 + Math.round(Math.min(1, Math.max(0, progress)) * (PAGES - 1));
        if (page !== this.shown.page) {
            this.shown.page = page;
            this.pageNumber.setText(String(page));
            this.folio.setText(String(page));
        }
        this.drawBars(state, time);
        this.drawMeter();
    }

    private drawBars(state: DefenseState, time: number) {
        const confidence = state.confidence / 100;
        const danger = state.confidence < 30;
        this.confidence.setText(
            `CONFIDENCE  ${Math.round(state.confidence)} %`,
        );
        const tint =
            confidence > 0.6
                ? 0x8cf27a
                : confidence > 0.3
                  ? 0xffa94d
                  : 0xff6b6b;
        this.confidenceInk
            .setTint(tint)
            .setDisplaySize(Math.max(6, BAR_W * confidence), 30)
            .setAlpha(danger ? 0.65 + 0.35 * Math.sin(time / 90) : 1);
        this.eurekaInk
            .setDisplaySize(Math.max(4, BAR_W * (state.eureka / 100)), 26)
            .setAlpha(state.eureka > 0 ? 1 : 0);
        const g = this.frames;
        g.clear();
        g.lineStyle(1, COLORS.ink, 0.3);
        g.strokeRect(MARGIN.x + 12, 420, BAR_W, 30);
        g.strokeRect(MARGIN.x + 12, 478, BAR_W, 26);
        this.eurekaHint.setAlpha(
            state.eureka >= 100 && !state.eurekaActive ? 1 : 0,
        );
    }

    // Where the last presses landed: a ruler from early to late, in the pane's chrome ink.
    private drawMeter() {
        const g = this.meter;
        g.clear();
        const x = PANEL_X + 24;
        const w = WIDTH - x - 24;
        const y = 236;
        const mid = x + w / 2;
        const span = (ms: number) => (ms / WINDOWS.good) * (w / 2);
        g.lineStyle(1, CHROME, 0.55);
        g.lineBetween(x, y, x + w, y);
        for (const ms of [
            -WINDOWS.good,
            -WINDOWS.great,
            -WINDOWS.perfect,
            0,
            WINDOWS.perfect,
            WINDOWS.great,
            WINDOWS.good,
        ])
            g.lineBetween(
                mid + span(ms),
                y - (ms === 0 ? 10 : 5),
                mid + span(ms),
                y,
            );
        const now = this.scene.time.now;
        for (const tick of this.ticks) {
            const age = (now - tick.at) / 2500;
            if (age >= 1) continue;
            g.fillStyle(CHROME, 1 - age);
            g.fillRect(mid + span(tick.delta) - 1.5, y + 4, 3, 14);
        }
    }

    // Everything is drawn past the 1280 x 720 frame, so an expanded fullscreen canvas shows
    // more viewer and more paper instead of empty bands.
    private drawViewer() {
        const g = this.scene.add.graphics().setDepth(-10);
        g.fillStyle(COLORS.ground, 1).fillRect(
            -BLEED,
            -BLEED,
            WIDTH + 2 * BLEED,
            720 + 2 * BLEED,
        );
        g.fillStyle(0x2f3134, 1).fillRect(
            -BLEED,
            0,
            SIDEBAR_W + BLEED,
            720 + BLEED,
        );
        g.fillStyle(0x3c3f42, 1).fillRect(
            PANEL_X,
            TOOLBAR_H,
            WIDTH - PANEL_X + BLEED,
            720 + BLEED,
        );
        // The sheet, with a soft offset shadow (layered, so it also works in Canvas mode).
        for (let i = 5; i >= 1; i--) {
            g.fillStyle(0x000000, 0.055);
            g.fillRect(
                PAGE.x - i + 2,
                PAGE.y - i + 4,
                PAGE.w + 2 * i,
                720 + BLEED,
            );
        }
        g.fillStyle(COLORS.paper, 1).fillRect(
            PAGE.x,
            PAGE.y,
            PAGE.w,
            720 + BLEED,
        );
    }

    private drawThumbs() {
        const g = this.thumbs;
        g.clear();
        const x = (SIDEBAR_W - THUMB.w) / 2;
        SECTIONS.forEach((_, i) => {
            const y = THUMB.top + i * (THUMB.h + THUMB.gap);
            const isCurrent = i === this.section;
            if (isCurrent) {
                g.fillStyle(COLORS.selection, 1);
                g.fillRect(x - 5, y - 5, THUMB.w + 10, THUMB.h + 10);
            }
            g.fillStyle(COLORS.paper, i <= this.section ? 1 : 0.72);
            g.fillRect(x, y, THUMB.w, THUMB.h);
            g.fillStyle(COLORS.ink, 0.35);
            g.fillRect(x + 10, y + 12, 44, 4);
            for (let line = 0; line < 3; line++)
                g.fillRect(x + 10, y + 24 + line * 7, THUMB.w - 20, 2);
            LANE_COLORS.forEach((color, lane) => {
                g.fillStyle(color, 0.9);
                g.fillRect(
                    x + 12 + lane * 18,
                    y + 58 + ((lane * 13 + i * 7) % 30),
                    14,
                    6,
                );
            });
            if (i < this.section) {
                g.lineStyle(2.4, COLORS.redPen, 1);
                g.lineBetween(
                    x + THUMB.w - 26,
                    y + THUMB.h - 20,
                    x + THUMB.w - 20,
                    y + THUMB.h - 13,
                );
                g.lineBetween(
                    x + THUMB.w - 20,
                    y + THUMB.h - 13,
                    x + THUMB.w - 8,
                    y + THUMB.h - 30,
                );
            }
        });
    }

    private keyHint(x: number, y: number, key: string, what: string) {
        const cap = this.scene.add
            .text(x + 8, y, key, serif(13, CSS.chrome, "bold"))
            .setDepth(3);
        const g = this.scene.add.graphics().setDepth(2);
        g.lineStyle(1, CHROME, 0.6);
        g.strokeRoundedRect(x, y - 3, cap.width + 16, 22, 4);
        this.scene.add
            .text(x + cap.width + 26, y, what, serif(13, CSS.chromeMuted))
            .setDepth(3);
    }

    private button(
        x: number,
        y: number,
        w: number,
        h: number,
        onClick: () => void,
    ) {
        this.scene.add
            .zone(x, y, w, h)
            .setOrigin(0, 0)
            .setDepth(42)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", onClick);
    }

    private drawSpeaker(g: GameObjects.Graphics, x: number, y: number) {
        g.fillStyle(CHROME, 1);
        g.fillRect(x - 9, y - 4, 5, 8);
        g.fillTriangle(x - 4, y - 4, x + 3, y - 10, x + 3, y + 10);
        g.fillTriangle(x - 4, y - 4, x + 3, y + 10, x - 4, y + 4);
        g.lineStyle(2, CHROME, 1);
        g.beginPath();
        g.arc(x + 4, y, 7, -0.8, 0.8);
        g.strokePath();
    }

    private drawFullscreenIcon(g: GameObjects.Graphics, x: number, y: number) {
        g.lineStyle(2, CHROME, 1);
        const s = 8;
        for (const [dx, dy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ]) {
            g.lineBetween(x + dx * s, y + dy * s, x + dx * s, y + dy * (s - 5));
            g.lineBetween(x + dx * s, y + dy * s, x + dx * (s - 5), y + dy * s);
        }
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
}
