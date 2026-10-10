// Buttons, banners and small helpers, all drawn by the engine.

import { GameObjects } from "phaser";
import type { Scene, Types } from "phaser";
import { CENTER, WIDTH } from "./layout";

export const FONT = '"Trebuchet MS", system-ui, sans-serif';

export const tween = (scene: Scene, config: Types.Tweens.TweenBuilderConfig) =>
    new Promise<void>((resolve) =>
        scene.tweens.add({ ...config, onComplete: () => resolve() }),
    );

export const wait = (scene: Scene, ms: number) =>
    new Promise<void>((resolve) => scene.time.delayedCall(ms, () => resolve()));

export function label(
    scene: Scene,
    x: number,
    y: number,
    text: string,
    size: number,
    color = "#ffffff",
) {
    return scene.add
        .text(x, y, text, {
            fontFamily: FONT,
            fontSize: `${size}px`,
            fontStyle: "bold",
            color,
            stroke: "#0b2a18",
            strokeThickness: Math.max(4, size / 6),
        })
        .setOrigin(0.5);
}

const BUTTON_COLORS = {
    gold: { face: 0xf5c451, edge: 0xb7862a, text: "#3d2a05" },
    green: { face: 0x6ccfa6, edge: 0x2f8a63, text: "#0c3323" },
    red: { face: 0xee5a78, edge: 0xa3304a, text: "#ffffff" },
    blue: { face: 0x6fa8ee, edge: 0x3a6fb3, text: "#0c2342" },
};

export class Button extends GameObjects.Container {
    private readonly face: GameObjects.Rectangle;
    private readonly text: GameObjects.Text;
    private enabled = true;
    private wanted = false; // shown, or popping in

    constructor(
        scene: Scene,
        x: number,
        y: number,
        text: string,
        color: keyof typeof BUTTON_COLORS,
        onClick: () => void,
        width = 148,
    ) {
        super(scene, x, y);
        const c = BUTTON_COLORS[color];
        const h = 64;
        const shadow = scene.add
            .rectangle(0, 8, width, h, 0x000000, 0.35)
            .setRounded(18);
        const edge = scene.add.rectangle(0, 5, width, h, c.edge).setRounded(18);
        this.face = scene.add.rectangle(0, 0, width, h, c.face).setRounded(18);
        const shine = scene.add
            .rectangle(0, -h / 4 + 2, width - 16, h / 2 - 8, 0xffffff, 0.22)
            .setRounded(12);
        this.text = scene.add
            .text(0, 0, text, {
                fontFamily: FONT,
                fontSize: "26px",
                fontStyle: "bold",
                color: c.text,
            })
            .setOrigin(0.5);
        this.add([shadow, edge, this.face, shine, this.text]);

        this.face.setInteractive({ useHandCursor: true });
        this.face.on("pointerover", () => this.enabled && this.pulse(1.07));
        this.face.on("pointerout", () => this.pulse(1));
        this.face.on("pointerdown", () => {
            if (!this.enabled) return;
            this.scene.tweens.add({
                targets: this,
                scale: 0.92,
                duration: 70,
                yoyo: true,
                ease: "Quad.easeOut",
            });
            onClick();
        });
        this.setDepth(50).setVisible(false);
        scene.add.existing(this);
    }

    private pulse(scale: number) {
        this.scene.tweens.add({
            targets: this,
            scale,
            duration: 120,
            ease: "Quad.easeOut",
        });
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        this.setAlpha(enabled ? 1 : 0.4);
        if (enabled) this.face.setInteractive({ useHandCursor: true });
        else this.face.disableInteractive();
        return this;
    }

    setLabel(text: string) {
        this.text.setText(text);
        return this;
    }

    // Pop in or out of the table.
    show(visible: boolean) {
        if (visible === this.wanted) return this;
        this.wanted = visible;
        this.scene.tweens.killTweensOf(this);
        if (visible) {
            this.setVisible(true)
                .setScale(0.4)
                .setAlpha(this.enabled ? 1 : 0.4);
            this.scene.tweens.add({
                targets: this,
                scale: 1,
                duration: 260,
                ease: "Back.easeOut",
            });
        } else {
            this.scene.tweens.add({
                targets: this,
                scale: 0.4,
                alpha: 0,
                duration: 140,
                ease: "Quad.easeIn",
                onComplete: () => this.setVisible(false),
            });
        }
        return this;
    }
}

// A big announcement across the table that slams in and fades out.
export async function banner(
    scene: Scene,
    title: string,
    subtitle: string,
    color: string,
) {
    const strip = scene.add
        .rectangle(CENTER.x, CENTER.y, WIDTH, 170, 0x000000, 0.55)
        .setDepth(80)
        .setScale(1, 0);
    const big = label(scene, CENTER.x, 478, title, 92, color)
        .setDepth(81)
        .setScale(3)
        .setAlpha(0);
    const small = label(scene, CENTER.x, 552, subtitle, 30)
        .setDepth(81)
        .setAlpha(0);
    await Promise.all([
        tween(scene, {
            targets: strip,
            scaleY: 1,
            duration: 180,
            ease: "Quad.easeOut",
        }),
        tween(scene, {
            targets: big,
            scale: 1,
            alpha: 1,
            duration: 320,
            ease: "Back.easeOut",
        }),
        tween(scene, { targets: small, alpha: 1, duration: 300, delay: 160 }),
    ]);
    await wait(scene, 900);
    await tween(scene, {
        targets: [strip, big, small],
        alpha: 0,
        duration: 260,
    });
    [strip, big, small].forEach((o) => o.destroy());
}

// Text that floats up from a point and fades.
export function floatText(
    scene: Scene,
    x: number,
    y: number,
    text: string,
    color: string,
) {
    const t = label(scene, x, y, text, 34, color).setDepth(85);
    scene.tweens.add({
        targets: t,
        y: y - 70,
        alpha: 0,
        duration: 1100,
        ease: "Cubic.easeOut",
        onComplete: () => t.destroy(),
    });
}

// A speech bubble with its top-left corner at (x, y); the tail points up at the speaker,
// `tailX` px from the bubble's left edge.
export function speechBubble(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    tailX: number,
    text: string,
): GameObjects.Container {
    const padding = 16;
    const words = scene.add.text(padding, padding, text, {
        fontFamily: FONT,
        fontSize: "23px",
        fontStyle: "bold",
        color: "#3d2a05",
        wordWrap: { width: width - 2 * padding },
    });
    const box = scene.add
        .rectangle(0, 0, width, words.height + 2 * padding, 0xfff6ec, 0.96)
        .setOrigin(0)
        .setRounded(18);
    const tail = scene.add
        .triangle(tailX - 14, -17, 0, 18, 14, 0, 28, 18, 0xfff6ec, 0.96)
        .setOrigin(0);
    return scene.add.container(x, y, [tail, box, words]).setDepth(55);
}
