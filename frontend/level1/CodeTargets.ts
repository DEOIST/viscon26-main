// Code-native bug sprites and cartoon bombs. Fuse fire crawls toward the bomb as time runs out.
import { textStyle } from "./effects";
import type { GameObjects, Scene } from "phaser";

export function makeBug(scene: Scene): GameObjects.Container {
    const patterns = [
        [
            "00100000100",
            "00010001000",
            "00111111100",
            "01101110110",
            "11111111111",
            "10111111101",
            "10100000101",
            "00011011000",
        ],
        [
            "000111000",
            "001111100",
            "011111110",
            "110101011",
            "111111111",
            "001010100",
            "010101010",
            "101000101",
        ],
        [
            "000011110000",
            "001111111100",
            "011111111110",
            "110011110011",
            "111111111111",
            "000110011000",
            "001001100100",
            "110000000011",
        ],
    ];
    const palette = [0x79f2a5, 0xab8aff, 0x6fd8ff, 0xff9e6b];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const color = palette[Math.floor(Math.random() * palette.length)];
    const art = scene.add.graphics();
    const pixel = 12;
    pattern.forEach((row, y) => {
        [...row].forEach((cell, x) => {
            if (cell !== "1") return;
            const left = (x - row.length / 2) * pixel;
            const top = (y - pattern.length / 2) * pixel;
            art.fillStyle(0x152639);
            art.fillRect(left + 3, top + 4, pixel, pixel);
            art.fillStyle(color);
            art.fillRect(left, top, pixel - 1, pixel - 1);
            art.fillStyle(0xffffff, 0.2);
            art.fillRect(left, top, pixel - 1, 2);
        });
    });
    const label = scene.add
        .text(0, 77, "BUG", {
            ...textStyle(16, "#d7ffe6", "bold"),
            fontFamily: "monospace",
            strokeThickness: 3,
        })
        .setOrigin(0.5);
    return scene.add.container(0, 0, [art, label]);
}

export function makeCodeBomb(scene: Scene): GameObjects.Container {
    const card = scene.add
        .rectangle(0, 0, 236, 130, 0x193931)
        .setStrokeStyle(3, 0x76d8ad);
    const title = scene.add.text(-101, -48, "✓ WORKING CODE", {
        ...textStyle(17, "#9ff3c6", "bold"),
        strokeThickness: 0,
    });
    const code = scene.add.text(-101, -16, "if (ready) {\n  ship();\n}", {
        fontFamily: "monospace",
        fontSize: "19px",
        color: "#d0e5db",
    });
    const bomb = scene.add.graphics();
    bomb.fillStyle(0x080b12);
    bomb.fillCircle(77, 13, 37);
    bomb.lineStyle(3, 0x657286);
    bomb.strokeCircle(77, 13, 37);
    bomb.fillStyle(0x394456);
    bomb.fillCircle(64, 0, 9);
    bomb.fillStyle(0x111722);
    bomb.fillRect(69, -31, 16, 12);
    const fuse = scene.add.graphics();
    const view = scene.add.container(0, 0, [card, title, code, bomb, fuse]);
    view.setData("fuse", fuse);
    drawFuse(view, 0, 0);
    return view;
}

export function drawFuse(
    view: GameObjects.Container,
    progress: number,
    elapsedMs: number,
) {
    const fuse = view.getData("fuse") as GameObjects.Graphics;
    fuse.clear();
    const t = Math.min(1, Math.max(0, progress));
    // Quadratic rope from bomb cap to the far end; the lit end burns back toward the cap.
    const point = (u: number) => ({
        x: 77 + 94 * u,
        y: -29 - 120 * u + 56 * u * u,
    });
    fuse.lineStyle(5, 0xd9bd8b);
    for (let segment = 0; segment < 16; segment += 1) {
        const a = point(((1 - t) * segment) / 16);
        const b = point(((1 - t) * (segment + 1)) / 16);
        fuse.lineBetween(a.x, a.y, b.x, b.y);
    }
    const fire = point(1 - t);
    view.setData("fire", fire);
    const flicker = Math.sin(elapsedMs / 47) * 3;
    fuse.fillStyle(0xff692e, 0.3);
    fuse.fillCircle(fire.x, fire.y, 19 + flicker);
    fuse.fillStyle(0xff862c);
    fuse.fillTriangle(
        fire.x - 10,
        fire.y + 7,
        fire.x + 10,
        fire.y + 7,
        fire.x + flicker,
        fire.y - 24,
    );
    fuse.fillStyle(0xffe496);
    fuse.fillCircle(fire.x, fire.y, 6);
    fuse.lineStyle(2, 0xffdf86);
    for (let spark = 0; spark < 4; spark += 1) {
        const angle = elapsedMs / 170 + (spark * Math.PI) / 2;
        fuse.lineBetween(
            fire.x + Math.cos(angle) * 17,
            fire.y + Math.sin(angle) * 17,
            fire.x + Math.cos(angle) * 25,
            fire.y + Math.sin(angle) * 25,
        );
    }
}
