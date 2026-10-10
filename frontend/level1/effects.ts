// Short-lived effects for the shooter (the juice) and its text style. They create their own
// game objects, clean them up when done, and know nothing about the round.

import type { Scene, Types } from "phaser";

export function textStyle(
    size: number,
    color: string,
    fontStyle = "normal",
): Types.GameObjects.Text.TextStyle {
    return {
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: `${size}px`,
        fontStyle,
        color,
        stroke: "#000000",
        strokeThickness: 5,
    };
}

export function muzzleFlash(scene: Scene, x: number, y: number) {
    const muzzle = scene.add.circle(x, y, 22, 0xfff3b0, 0.95).setDepth(1999);
    scene.tweens.add({
        targets: muzzle,
        scale: 2.2,
        alpha: 0,
        duration: 160,
        onComplete: () => muzzle.destroy(),
    });
}

export function shatter(scene: Scene, x: number, y: number, color: number) {
    for (let index = 0; index < 10; index += 1) {
        const piece = scene.add.rectangle(x, y, 26, 18, color).setDepth(1500);
        scene.tweens.add({
            targets: piece,
            x: x + (Math.random() - 0.5) * 260,
            y: y + (Math.random() - 0.3) * 220,
            angle: (Math.random() - 0.5) * 360,
            alpha: 0,
            duration: 450,
            onComplete: () => piece.destroy(),
        });
    }
}

export function floatText(
    scene: Scene,
    x: number,
    y: number,
    text: string,
    color: string,
) {
    const label = scene.add
        .text(x, y, text, textStyle(34, color, "bold"))
        .setOrigin(0.5)
        .setDepth(1998);
    scene.tweens.add({
        targets: label,
        y: y - 60,
        alpha: 0,
        duration: 650,
        onComplete: () => label.destroy(),
    });
}
