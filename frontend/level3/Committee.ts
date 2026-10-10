// The examination committee behind its desk: three professors drawn in code whose faces
// follow the defense (impressed by streaks, disappointed by misses, furious in the meltdown),
// with speech bubbles and a spotlight on whoever is asking the questions.

import { GameObjects } from "phaser";
import type { Scene } from "phaser";
import { DESK_Y, PROFESSOR_Y, PROFESSORS_X, WIDTH } from "./layout";
import { PROFESSORS } from "./lines";
import { COLORS, FONT } from "./textures";

export type Mood =
    "neutral" | "impressed" | "amazed" | "disappointed" | "furious";

interface Look {
    skin: number;
    hair: number;
    suit: number;
    tie: number;
    hairStyle: "bun" | "tufts" | "spiky";
    glasses: "round" | "square";
}

const LOOKS: Look[] = [
    {
        skin: 0xf1c9a5,
        hair: 0xc4c9d2,
        suit: 0x4b3a78,
        tie: 0xff4fd8,
        hairStyle: "bun",
        glasses: "round",
    },
    {
        skin: 0xd9a27a,
        hair: 0x3a2c25,
        suit: 0x1d2a4f,
        tie: 0xff4f6d,
        hairStyle: "tufts",
        glasses: "square",
    },
    {
        skin: 0xe8b98f,
        hair: 0xb95836,
        suit: 0xe8eef7,
        tie: 0x3ee0ff,
        hairStyle: "spiky",
        glasses: "round",
    },
];

class Professor {
    readonly root: GameObjects.Container;
    private readonly face: GameObjects.Graphics;
    private readonly spot: GameObjects.Image;
    private readonly look: Look;
    private readonly baseX: number;
    mood: Mood = "neutral";
    private shake = 0;

    constructor(scene: Scene, index: number) {
        this.look = LOOKS[index];
        this.baseX = PROFESSORS_X[index];
        this.root = scene.add.container(this.baseX, PROFESSOR_Y).setDepth(4);
        this.spot = scene.add
            .image(0, -10, "td-glow")
            .setScale(2.2)
            .setAlpha(0)
            .setBlendMode("ADD");
        const body = scene.add.graphics();
        body.fillStyle(this.look.suit, 1);
        body.fillRoundedRect(-46, 26, 92, 70, 22);
        body.fillStyle(0xffffff, 1);
        body.fillTriangle(-12, 28, 12, 28, 0, 52);
        body.fillStyle(this.look.tie, 1);
        body.fillTriangle(-5, 32, 5, 32, 0, 66);
        this.face = scene.add.graphics();
        this.root.add([this.spot, body, this.face]);
        this.draw();
    }

    setMood(mood: Mood) {
        if (mood === this.mood) return;
        this.mood = mood;
        this.draw();
    }

    setLead(isLead: boolean, color: number) {
        this.spot.setTint(color).setAlpha(isLead ? 0.55 : 0);
    }

    jolt() {
        this.shake = 1;
    }

    update(time: number, delta: number) {
        const furious = this.mood === "furious";
        this.shake = Math.max(0, this.shake - delta / 400);
        const tremble = (furious ? 2.5 : 0) + this.shake * 6;
        this.root.x = this.baseX + Math.sin(time / 23) * tremble;
        this.root.y =
            PROFESSOR_Y +
            Math.sin(time / 600 + this.baseX) * 2 -
            (this.mood === "amazed" ? 6 : 0);
    }

    private draw() {
        const g = this.face;
        const look = this.look;
        const mood = this.mood;
        g.clear();
        const skin = mood === "furious" ? 0xff7a6b : look.skin;
        g.fillStyle(skin, 1);
        g.fillCircle(0, 0, 30);
        g.fillStyle(look.hair, 1);
        if (look.hairStyle === "bun") {
            g.fillCircle(0, -34, 13);
            g.fillEllipse(0, -22, 62, 22);
        } else if (look.hairStyle === "tufts") {
            g.fillEllipse(-29, -8, 14, 24);
            g.fillEllipse(29, -8, 14, 24);
            g.fillEllipse(0, 26, 40, 16); // beard
        } else {
            for (let i = -3; i <= 3; i++)
                g.fillTriangle(i * 9 - 8, -18, i * 9 + 8, -18, i * 10, -44);
        }
        // Glasses.
        g.lineStyle(3, 0x14182b, 1);
        g.fillStyle(0xffffff, 0.95);
        const eyeY = -2;
        for (const x of [-12, 12]) {
            if (look.glasses === "round") {
                g.fillCircle(x, eyeY, 9);
                g.strokeCircle(x, eyeY, 9);
            } else {
                g.fillRect(x - 10, eyeY - 7, 20, 14);
                g.strokeRect(x - 10, eyeY - 7, 20, 14);
            }
        }
        g.lineBetween(-3, eyeY, 3, eyeY);
        // Pupils: wide when amazed, half-closed when disappointed.
        g.fillStyle(0x14182b, 1);
        const pupil = mood === "amazed" ? 2 : mood === "furious" ? 2.5 : 3.5;
        for (const x of [-12, 12]) g.fillCircle(x, eyeY + 1, pupil);
        if (mood === "disappointed") {
            g.fillStyle(skin, 1);
            for (const x of [-12, 12]) g.fillRect(x - 9, eyeY - 9, 18, 8);
        }
        // Eyebrows carry most of the emotion.
        g.lineStyle(4, look.hairStyle === "spiky" ? look.hair : 0x2a2230, 1);
        const brow = {
            neutral: [0, 0],
            impressed: [-6, -6],
            amazed: [-10, -10],
            disappointed: [-2, 5],
            furious: [6, -4],
        }[mood];
        g.lineBetween(-21, eyeY - 13 + brow[1], -5, eyeY - 13 + brow[0]);
        g.lineBetween(5, eyeY - 13 + brow[0], 21, eyeY - 13 + brow[1]);
        // Mouth.
        g.lineStyle(3, 0x3a1a1a, 1);
        if (mood === "amazed") {
            g.fillStyle(0x3a1a1a, 1);
            g.fillEllipse(0, 16, 12, 14);
        } else if (mood === "furious") {
            g.fillStyle(0x3a1a1a, 1);
            g.fillRoundedRect(-12, 10, 24, 11, 3);
            g.fillStyle(0xffffff, 1);
            g.fillRect(-10, 11, 20, 4);
        } else if (mood === "impressed") {
            g.beginPath();
            g.arc(0, 9, 9, 0.2, Math.PI - 0.2);
            g.strokePath();
        } else if (mood === "disappointed") {
            g.beginPath();
            g.arc(0, 22, 9, Math.PI + 0.3, -0.3);
            g.strokePath();
        } else {
            g.lineBetween(-8, 15, 8, 15);
        }
    }
}

export default class Committee {
    private readonly scene: Scene;
    private readonly professors: Professor[];
    private readonly bubble: GameObjects.Container;
    private readonly bubbleBox: GameObjects.Rectangle;
    private readonly bubbleText: GameObjects.Text;
    private bubbleUntil = 0;
    private moodUntil = 0;
    private baseMoods: Mood[] = ["neutral", "neutral", "neutral"];

    constructor(scene: Scene) {
        this.scene = scene;
        this.professors = [0, 1, 2].map((i) => new Professor(scene, i));
        this.drawDesk();
        this.bubbleBox = scene.add
            .rectangle(0, 0, 300, 54, 0xffffff, 1)
            .setStrokeStyle(3, COLORS.ink)
            .setRounded(16);
        this.bubbleText = scene.add
            .text(0, 0, "", {
                fontFamily: FONT,
                fontSize: "19px",
                fontStyle: "bold",
                color: "#10142e",
                align: "center",
                wordWrap: { width: 280 },
            })
            .setOrigin(0.5);
        this.bubble = scene.add
            .container(0, 0, [this.bubbleBox, this.bubbleText])
            .setDepth(40)
            .setVisible(false);
    }

    // The mood each professor returns to after a short reaction.
    setBaseMoods(moods: Mood[]) {
        this.baseMoods = moods;
        if (this.scene.time.now >= this.moodUntil) this.applyBase();
    }

    react(mood: Mood, ms: number, who: number[] = [0, 1, 2]) {
        for (const i of who) this.professors[i].setMood(mood);
        if (mood === "furious" || mood === "amazed")
            for (const i of who) this.professors[i].jolt();
        this.moodUntil = this.scene.time.now + ms;
    }

    setLead(lead: number | null, color: number) {
        this.professors.forEach((professor, i) =>
            professor.setLead(lead === null || lead === i, color),
        );
    }

    say(who: number, text: string, ms = 2200) {
        const x = PROFESSORS_X[who];
        const width = Math.min(340, Math.max(170, this.textWidth(text) + 36));
        this.bubbleText.setText(text).setWordWrapWidth(width - 24);
        const height = Math.max(50, this.bubbleText.height + 22);
        this.bubbleBox.setSize(width, height);
        const bx = Math.max(
            width / 2 + 10,
            Math.min(WIDTH - width / 2 - 10, x),
        );
        this.bubble.setPosition(bx, PROFESSOR_Y - 92).setVisible(true);
        this.bubble.setScale(0.6).setAlpha(0);
        this.scene.tweens.add({
            targets: this.bubble,
            scale: 1,
            alpha: 1,
            duration: 160,
            ease: "Back.Out",
        });
        this.bubbleUntil = this.scene.time.now + ms;
        this.professors[who].jolt();
    }

    hideBubble() {
        this.bubble.setVisible(false);
        this.bubbleUntil = 0;
    }

    update(time: number, delta: number) {
        for (const professor of this.professors) professor.update(time, delta);
        if (this.bubbleUntil && time >= this.bubbleUntil) this.hideBubble();
        if (this.moodUntil && time >= this.moodUntil) {
            this.moodUntil = 0;
            this.applyBase();
        }
    }

    private applyBase() {
        this.professors.forEach((professor, i) =>
            professor.setMood(this.baseMoods[i]),
        );
    }

    private textWidth(text: string): number {
        return text.length * 10;
    }

    private drawDesk() {
        const g = this.scene.add.graphics().setDepth(5);
        const left = PROFESSORS_X[0] - 120;
        const right = PROFESSORS_X[2] + 120;
        g.fillStyle(0x000000, 0.35);
        g.fillRect(left + 6, DESK_Y + 8, right - left, 40);
        g.fillStyle(0x3b2416, 1);
        g.fillRect(left, DESK_Y, right - left, 40);
        g.fillStyle(0x6a4128, 1);
        g.fillRect(left, DESK_Y, right - left, 8);
        g.lineStyle(2, 0x21140c, 1);
        g.strokeRect(left, DESK_Y, right - left, 40);
        PROFESSORS.forEach((professor, i) => {
            const x = PROFESSORS_X[i];
            g.fillStyle(0xf4ead2, 1);
            g.fillRect(x - 70, DESK_Y + 6, 140, 30);
            const plate = (y: number, value: string, size: number) =>
                this.scene.add
                    .text(x, y, value, {
                        fontFamily: FONT,
                        fontSize: `${size}px`,
                        fontStyle: "bold",
                        color: "#3b2416",
                    })
                    .setOrigin(0.5)
                    .setDepth(6);
            plate(DESK_Y + 15, professor.name, 12);
            plate(DESK_Y + 28, professor.field, 9);
        });
    }
}
