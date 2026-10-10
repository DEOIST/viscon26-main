// The committee lives in the page margin: three professors doodled in blue ballpoint (the
// way students draw them in lecture notes), their faces following the defense, with their
// remarks written beside the figure in red pen. Every miss leaves a permanent red mark on
// the margin's errata timeline, so the page records where the defense went wrong.

import type { GameObjects, Scene } from "phaser";
import { COLUMN, FIGURE_TOP, HIT_Y, MARGIN } from "./layout";
import { COLORS, CSS, hand, penCircle, penLine, seeded } from "./textures";
import { TEXT } from "../src/misc/text";

const COPY = TEXT.thesisDefense;

export type Mood =
    "neutral" | "impressed" | "amazed" | "disappointed" | "furious";

const HEAD_Y = 152;
const HEAD_R = 21;
const HEAD_GAP = 72;
const NAMES = COPY.professors;
const NOTE_TOP = 222;
// The errata timeline runs down the gutter between the figure and the margin.
const SCAR_X = COLUMN.x + COLUMN.w + 18;

const headX = (i: number) => MARGIN.x + 34 + i * HEAD_GAP;

class Doodle {
    private readonly index: number;
    private readonly g: GameObjects.Graphics;
    private readonly ring: GameObjects.Graphics;
    private mood: Mood = "neutral";
    private shake = 0;

    constructor(scene: Scene, index: number) {
        this.index = index;
        this.g = scene.add.graphics({ x: headX(index), y: HEAD_Y }).setDepth(8);
        this.ring = scene.add
            .graphics({ x: headX(index), y: HEAD_Y })
            .setDepth(8);
        scene.add
            .text(
                headX(index),
                HEAD_Y + HEAD_R + 16,
                NAMES[index],
                hand(15, CSS.bluePen),
            )
            .setOrigin(0.5, 0)
            .setDepth(8);
        this.draw();
    }

    setMood(mood: Mood) {
        if (mood === this.mood) return;
        this.mood = mood;
        this.draw();
    }

    // The professor asking the questions is circled in red.
    setLead(isLead: boolean) {
        this.ring.clear();
        if (!isLead) return;
        this.ring.lineStyle(2.4, COLORS.redPen, 0.9);
        penCircle(this.ring, 0, 2, HEAD_R + 12, HEAD_R + 12, this.index + 3);
    }

    jolt() {
        this.shake = 1;
    }

    update(time: number, delta: number) {
        this.shake = Math.max(0, this.shake - delta / 350);
        const tremble = (this.mood === "furious" ? 1.6 : 0) + this.shake * 4;
        this.g.x =
            headX(this.index) + Math.sin(time / 21 + this.index) * tremble;
        this.ring.x = this.g.x;
    }

    private draw() {
        const g = this.g;
        const mood = this.mood;
        const seed = this.index * 31 + 1;
        g.clear();
        g.lineStyle(2.2, COLORS.bluePen, 1);
        // Head, a little lopsided like every margin doodle.
        const random = seeded(seed);
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const r = HEAD_R * (1 + (random() - 0.5) * 0.07);
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r * 1.08;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.strokePath();
        // Hair: Lemma's bun, Gradient's bald top with tufts, Bootstrap's spikes.
        if (this.index === 0) penCircle(g, 0, -HEAD_R - 6, 7, 6, seed);
        else if (this.index === 1) {
            penLine(g, -HEAD_R + 1, -6, -HEAD_R - 5, -12, 0.4, seed);
            penLine(g, HEAD_R - 1, -6, HEAD_R + 5, -12, 0.4, seed + 1);
        } else
            for (let i = -2; i <= 2; i++)
                penLine(
                    g,
                    i * 7 - 4,
                    -HEAD_R + 4,
                    i * 7 + 1,
                    -HEAD_R - 9,
                    0.3,
                    seed + i,
                );
        // Glasses.
        penCircle(g, -8, -2, 6, 5.5, seed + 5);
        penCircle(g, 8, -2, 6, 5.5, seed + 6);
        penLine(g, -2, -2, 2, -2, 0.2, seed);
        const pupil = mood === "amazed" ? 1.2 : 2;
        g.fillStyle(COLORS.bluePen, 1);
        g.fillCircle(-8, -1, pupil);
        g.fillCircle(8, -1, pupil);
        // Brows carry the emotion.
        const brow = {
            neutral: [0, 0],
            impressed: [-3, -3],
            amazed: [-6, -6],
            disappointed: [-1, 3],
            furious: [4, -3],
        }[mood];
        penLine(g, -14, -11 + brow[1], -3, -11 + brow[0], 0.3, seed + 7);
        penLine(g, 3, -11 + brow[0], 14, -11 + brow[1], 0.3, seed + 8);
        // Mouth.
        if (mood === "amazed") penCircle(g, 0, 11, 4, 5, seed + 9);
        else if (mood === "impressed") {
            penLine(g, -7, 9, 0, 13, 0.3, seed + 10);
            penLine(g, 0, 13, 7, 9, 0.3, seed + 11);
        } else if (mood === "disappointed") {
            penLine(g, -7, 13, 0, 10, 0.3, seed + 10);
            penLine(g, 0, 10, 7, 13, 0.3, seed + 11);
        } else if (mood === "furious") {
            penLine(g, -8, 11, 8, 11, 1.4, seed + 10);
            // Red steam, the one place a doodle borrows the committee's pen.
            g.lineStyle(2.2, COLORS.redPen, 1);
            for (let i = -1; i <= 1; i++)
                penLine(
                    g,
                    i * 9 - 3,
                    -HEAD_R - 6,
                    i * 9 + 3,
                    -HEAD_R - 16,
                    0.8,
                    seed + i,
                );
        } else penLine(g, -6, 11, 6, 11, 0.3, seed + 10);
    }
}

export default class Committee {
    private readonly scene: Scene;
    private readonly doodles: Doodle[];
    private readonly note: GameObjects.Text;
    private readonly signature: GameObjects.Text;
    private readonly bracket: GameObjects.Graphics;
    private readonly scars: GameObjects.Graphics;
    private readonly scrawl: GameObjects.Text;
    private readonly scrawlLine: GameObjects.Graphics;
    private noteUntil = 0;
    private moodUntil = 0;
    private baseMoods: Mood[] = ["neutral", "neutral", "neutral"];
    private scarCount = 0;

    constructor(scene: Scene) {
        this.scene = scene;
        this.doodles = [0, 1, 2].map((i) => new Doodle(scene, i));
        this.bracket = scene.add.graphics().setDepth(8);
        this.note = scene.add
            .text(MARGIN.x + 26, NOTE_TOP, "", {
                ...hand(22, CSS.redPen),
                wordWrap: { width: MARGIN.w - 40 },
                lineSpacing: -4,
            })
            .setDepth(8)
            .setAngle(-2);
        this.signature = scene.add
            .text(MARGIN.x + MARGIN.w - 22, NOTE_TOP, "", hand(16, CSS.redPen))
            .setOrigin(1, 0)
            .setDepth(8);
        this.scars = scene.add.graphics().setDepth(8);
        this.scrawl = scene.add
            .text(MARGIN.x - 270, 300, "", hand(30, CSS.redPen, true))
            .setOrigin(0.5)
            .setDepth(30)
            .setAlpha(0);
        this.scrawlLine = scene.add.graphics().setDepth(30);
        scene.add
            .text(
                SCAR_X - 4,
                HIT_Y + 24,
                COPY.page.errata,
                hand(14, CSS.redPen),
            )
            .setOrigin(0, 0.5)
            .setAngle(-90)
            .setDepth(8);
    }

    setBaseMoods(moods: Mood[]) {
        this.baseMoods = moods;
        if (this.scene.time.now >= this.moodUntil) this.applyBase();
    }

    react(mood: Mood, ms: number, who: number[] = [0, 1, 2]) {
        for (const i of who) {
            this.doodles[i].setMood(mood);
            if (mood === "furious" || mood === "amazed") this.doodles[i].jolt();
        }
        this.moodUntil = this.scene.time.now + ms;
    }

    setLead(lead: number | null) {
        this.doodles.forEach((doodle, i) => doodle.setLead(lead === i));
    }

    // A remark written in the margin and signed.
    say(who: number, text: string, ms = 2600) {
        this.scene.tweens.killTweensOf([this.note, this.signature]);
        this.note
            .setText(text)
            .setAlpha(0)
            .setY(NOTE_TOP + 6);
        this.signature
            .setText(`— ${NAMES[who]}`)
            .setY(NOTE_TOP + 8 + this.note.height)
            .setAlpha(0);
        this.scene.tweens.add({
            targets: [this.note, this.signature],
            alpha: 1,
            y: "-=6",
            duration: 180,
            ease: "Cubic.Out",
        });
        const top = NOTE_TOP + 4;
        const bottom = NOTE_TOP + this.note.height;
        const mid = (top + bottom) / 2;
        this.bracket.clear();
        this.bracket.lineStyle(2, COLORS.redPen, 0.85);
        penLine(
            this.bracket,
            MARGIN.x + 18,
            top,
            MARGIN.x + 12,
            mid,
            0.6,
            who + 17,
        );
        penLine(
            this.bracket,
            MARGIN.x + 12,
            mid,
            MARGIN.x + 18,
            bottom,
            0.6,
            who + 18,
        );
        penLine(
            this.bracket,
            MARGIN.x + 12,
            mid,
            MARGIN.x + 7,
            mid,
            0.6,
            who + 19,
        );
        this.noteUntil = this.scene.time.now + ms;
        this.doodles[who].jolt();
    }

    hideNote() {
        this.scene.tweens.killTweensOf([this.note, this.signature]);
        this.note.setAlpha(0);
        this.signature.setAlpha(0);
        this.bracket.clear();
        this.noteUntil = 0;
    }

    // A permanent red mark on the errata timeline, where in the defense it happened.
    scar(progress: number) {
        const span = HIT_Y + 30 - FIGURE_TOP;
        const y = FIGURE_TOP + Math.min(1, Math.max(0, progress)) * span;
        const random = seeded(++this.scarCount * 97);
        this.scars.lineStyle(2.4, COLORS.redPen, 0.9);
        penLine(
            this.scars,
            SCAR_X - 12,
            y - 4 + random() * 3,
            SCAR_X,
            y + 4,
            0.6,
            this.scarCount,
        );
    }

    clearScars() {
        this.scars.clear();
        this.scarCount = 0;
    }

    // A milestone scrawled across the figure in red pen, underlined twice.
    scribble(text: string) {
        const g = this.scrawlLine;
        this.scene.tweens.killTweensOf([this.scrawl, g]);
        this.scrawl.setText(text).setAlpha(1).setScale(1.25).setAngle(-5);
        this.scene.tweens.add({
            targets: this.scrawl,
            scale: 1,
            duration: 200,
            ease: "Back.Out",
        });
        g.clear().setAlpha(1);
        g.lineStyle(3, COLORS.redPen, 0.9);
        const half = Math.min(250, this.scrawl.width / 2);
        const x = this.scrawl.x;
        const y = this.scrawl.y + 30;
        penLine(g, x - half, y + 6, x + half, y - 12, 1.5, text.length);
        penLine(
            g,
            x - half + 16,
            y + 14,
            x + half - 10,
            y - 4,
            1.5,
            text.length + 3,
        );
        this.scene.tweens.add({
            targets: [this.scrawl, g],
            alpha: 0,
            delay: 1300,
            duration: 360,
        });
    }

    update(time: number, delta: number) {
        for (const doodle of this.doodles) doodle.update(time, delta);
        if (this.noteUntil && time >= this.noteUntil) {
            this.noteUntil = 0;
            this.scene.tweens.add({
                targets: [this.note, this.signature],
                alpha: 0.3,
                duration: 500,
            });
        }
        if (this.moodUntil && time >= this.moodUntil) {
            this.moodUntil = 0;
            this.applyBase();
        }
    }

    private applyBase() {
        this.doodles.forEach((doodle, i) => doodle.setMood(this.baseMoods[i]));
    }
}
