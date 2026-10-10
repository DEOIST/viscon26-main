// The player's student at the front of the room, in their avatar's colours: sweating when
// confidence is low, cheering at milestones, slumped when the defense fails.

import { GameObjects } from "phaser";
import type { Scene } from "phaser";
import { HUD_LEFT_X } from "./layout";
import { FONT } from "./textures";

export type Pose = "calm" | "nervous" | "cheer" | "defeated";

const X = HUD_LEFT_X;
const Y = 618;

function hexColor(value: string | undefined, fallback: number): number {
    return value && /^#[0-9a-f]{6}$/i.test(value)
        ? parseInt(value.slice(1), 16)
        : fallback;
}

export default class Student {
    private readonly scene: Scene;
    private readonly root: GameObjects.Container;
    private readonly body: GameObjects.Graphics;
    private readonly sweat: GameObjects.Graphics;
    private readonly skin: number;
    private readonly hair: number;
    private pose: Pose | null = null;
    private cheerUntil = 0;

    constructor(
        scene: Scene,
        hairColor?: string,
        skinColor?: string,
        name = "",
    ) {
        this.scene = scene;
        this.skin = hexColor(skinColor, 0xe4b48f);
        this.hair = hexColor(hairColor, 0x70432e);
        this.body = scene.add.graphics();
        this.sweat = scene.add.graphics({ x: 30, y: -60 }).setAlpha(0);
        this.sweat.fillStyle(0x8fd8ff, 1);
        this.sweat.fillCircle(0, 6, 6);
        this.sweat.fillTriangle(-6, 5, 6, 5, 0, -8);
        const tag = scene.add
            .text(0, 74, name.toUpperCase(), {
                fontFamily: FONT,
                fontSize: "14px",
                fontStyle: "bold",
                color: "#c9d3ff",
            })
            .setOrigin(0.5);
        this.root = scene.add
            .container(X, Y, [this.body, this.sweat, tag])
            .setDepth(20);
        this.setPose("calm");
    }

    cheer(ms = 900) {
        this.cheerUntil = this.scene.time.now + ms;
        this.setPose("cheer");
    }

    update(time: number, confidence: number, failed: boolean) {
        if (failed) this.setPose("defeated");
        else if (time < this.cheerUntil) this.setPose("cheer");
        else this.setPose(confidence < 35 ? "nervous" : "calm");
        const hop =
            this.pose === "cheer" ? Math.abs(Math.sin(time / 90)) * 14 : 0;
        const shiver = this.pose === "nervous" ? Math.sin(time / 30) * 1.5 : 0;
        this.root.setPosition(X + shiver, Y - hop);
        this.sweat.setAlpha(
            this.pose === "nervous" ? 0.6 + 0.4 * Math.sin(time / 150) : 0,
        );
        this.sweat.y = -60 + ((time / 12) % 18);
    }

    private setPose(pose: Pose) {
        if (pose === this.pose) return;
        this.pose = pose;
        const g = this.body;
        g.clear();
        const slump = pose === "defeated" ? 10 : 0;
        // Hoodie in ETH blue, a laptop with the thesis on it.
        g.fillStyle(0x215caf, 1);
        g.fillRoundedRect(-30, -10 + slump, 60, 66, 18);
        g.fillStyle(0xffffff, 0.9);
        g.fillRect(-12, 6 + slump, 24, 4);
        // Arms: up in a V when cheering.
        g.lineStyle(10, 0x215caf, 1);
        if (pose === "cheer") {
            g.lineBetween(-24, 0, -44, -40);
            g.lineBetween(24, 0, 44, -40);
            g.fillStyle(this.skin, 1);
            g.fillCircle(-44, -42, 7);
            g.fillCircle(44, -42, 7);
        } else {
            g.lineBetween(-24, 4 + slump, -30, 34 + slump);
            g.lineBetween(24, 4 + slump, 30, 34 + slump);
            g.fillStyle(0x9aa6c8, 1);
            g.fillRect(-26, 26 + slump, 52, 6);
            g.fillStyle(0xc9d3ff, 1);
            g.fillRect(-22, 14 + slump, 44, 13);
        }
        // Head and hair.
        const headY = -34 + slump * 1.6;
        g.fillStyle(this.skin, 1);
        g.fillCircle(0, headY, 24);
        g.fillStyle(this.hair, 1);
        g.fillEllipse(0, headY - 14, 52, 24);
        g.fillStyle(0x14182b, 1);
        const eyeY = headY + 2;
        if (pose === "defeated") {
            g.lineStyle(3, 0x14182b, 1);
            for (const x of [-9, 9]) {
                g.lineBetween(x - 4, eyeY - 4, x + 4, eyeY + 4);
                g.lineBetween(x - 4, eyeY + 4, x + 4, eyeY - 4);
            }
        } else
            for (const x of [-9, 9])
                g.fillCircle(x, eyeY, pose === "nervous" ? 2 : 3);
        g.lineStyle(3, 0x3a1a1a, 1);
        g.beginPath();
        if (pose === "cheer") g.arc(0, headY + 9, 8, 0.1, Math.PI - 0.1);
        else if (pose === "nervous" || pose === "defeated")
            g.arc(0, headY + 18, 7, Math.PI + 0.4, -0.4);
        else g.arc(0, headY + 8, 6, 0.4, Math.PI - 0.4);
        g.strokePath();
    }
}
