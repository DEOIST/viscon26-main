// Rare interruptions pop in from either side; a slap knocks them out without aiming.
import { swipeHits } from "./swipeHit";
import type { CvSlide } from "./input/cvStream";
import { floatText } from "./effects";
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import {
    INTERRUPTER_MIN_DELAY_MS,
    INTERRUPTER_MAX_DELAY_MS,
    INTERRUPTER_STAY_MS,
} from "./config";
import type { GameObjects, Scene } from "phaser";

interface Walker {
    sprite: GameObjects.Container;
    side: "left" | "right";
    remainingMs: number;
    steps: number;
    color: number;
}

const SHIRTS = [0x68c6ff, 0xf4a65b, 0xb38aff, 0x73cd96, 0xe77094, 0xdad8c3];
const SKINS = [0xf2c49b, 0xc78c62, 0x895a40, 0xf2ceb7, 0xb87b54, 0xe5b388];
const HAIR = [0x292539, 0x743d26, 0x161c26, 0xe7bb5d, 0xa7aebc, 0x3a231b];

export default class SlapWalkers {
    knockedOut = 0;
    private walkers: Walker[] = [];
    private spawnMs = 0;
    private nextSpawnMs =
        INTERRUPTER_MIN_DELAY_MS +
        Math.random() * (INTERRUPTER_MAX_DELAY_MS - INTERRUPTER_MIN_DELAY_MS);
    private nextColor = 0;
    private readonly scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
        for (let color = 0; color < SHIRTS.length; color += 1)
            for (let frame = 0; frame < 2; frame += 1)
                this.makeTexture(color, frame);
    }

    update(delta: number) {
        this.spawnMs += delta;
        if (this.spawnMs >= this.nextSpawnMs && this.walkers.length === 0) {
            this.spawnMs = 0;
            this.nextSpawnMs =
                INTERRUPTER_MIN_DELAY_MS +
                Math.random() *
                    (INTERRUPTER_MAX_DELAY_MS - INTERRUPTER_MIN_DELAY_MS);
            this.spawn();
        }
        for (const walker of [...this.walkers]) {
            walker.remainingMs -= delta;
            walker.steps += delta;
            if (walker.remainingMs <= 0) {
                this.walkers = this.walkers.filter((other) => other !== walker);
                this.scene.tweens.add({
                    targets: walker.sprite,
                    x: walker.side === "left" ? -170 : GAME_WIDTH + 170,
                    duration: 250,
                    onComplete: () => walker.sprite.destroy(),
                });
                continue;
            }
            const person = walker.sprite.getAt(0) as GameObjects.Sprite;
            person.setTexture(
                this.textureKey(
                    walker.color,
                    Math.floor(walker.steps / 250) % 2,
                ),
            );
        }
    }

    slap(side: "left" | "right", slide?: CvSlide): boolean {
        const walker = this.walkers[0];
        if (!walker) return false;
        if (
            slide &&
            !swipeHits(slide, walker.sprite.x, walker.sprite.y - 115, 80)
        )
            return false;
        this.walkers = this.walkers.filter((other) => other !== walker);
        this.knockedOut += 1;
        const sprite = walker.sprite;
        this.scene.tweens.killTweensOf(sprite);
        const direction = side === "left" ? -1 : 1;
        floatText(this.scene, sprite.x, sprite.y - 80, "KO! ★", "#f2c14e");
        this.scene.cameras.main.shake(100, 0.003);
        // A sideways tumble, then a short pause lying down before disappearing.
        this.scene.tweens.add({
            targets: sprite,
            x: sprite.x + direction * 220,
            y: sprite.y + 70,
            angle: direction * 100,
            duration: 250,
            ease: "Quad.easeOut",
            onComplete: () => {
                this.scene.tweens.add({
                    targets: sprite,
                    alpha: 0,
                    delay: 450,
                    duration: 250,
                    onComplete: () => sprite.destroy(),
                });
            },
        });
        return true;
    }

    private spawn() {
        const color = this.nextColor++ % SHIRTS.length;
        const side = Math.random() < 0.5 ? "left" : "right";
        const person = this.scene.add
            .sprite(0, 0, this.textureKey(color, 0))
            .setOrigin(0.5, 1)
            .setScale(3.2);
        const sayings = [
            "Quick call?",
            "Works on my machine!",
            "Can you fix my printer?",
            "Just one tiny change…",
            "Have you tried AI?",
            "Let's circle back!",
            "Why isn't it done yet?",
            "Can you hop on Zoom?",
            "Make the logo bigger!",
            "Deadline was yesterday!",
        ];
        const bubble = this.scene.add
            .rectangle(0, -277, 222, 54, 0xffefd7)
            .setStrokeStyle(3, 0x6c5344);
        const words = this.scene.add
            .text(
                0,
                -277,
                sayings[Math.floor(Math.random() * sayings.length)],
                {
                    fontFamily: "monospace",
                    fontSize: "14px",
                    color: "#47372c",
                    wordWrap: { width: 205 },
                    align: "center",
                },
            )
            .setOrigin(0.5);
        const sprite = this.scene.add
            .container(
                side === "left" ? -170 : GAME_WIDTH + 170,
                GAME_HEIGHT * 0.79,
                [person, bubble, words],
            )
            .setDepth(1500);
        this.scene.tweens.add({
            targets: sprite,
            x: side === "left" ? 126 : GAME_WIDTH - 126,
            duration: 350,
            ease: "Back.easeOut",
        });
        this.walkers.push({
            sprite,
            side,
            remainingMs: INTERRUPTER_STAY_MS,
            steps: 0,
            color,
        });
    }

    private textureKey(color: number, frame: number): string {
        return `interrupter-v2-${color}-${frame}`;
    }

    private makeTexture(color: number, frame: number) {
        const key = this.textureKey(color, frame);
        if (this.scene.textures.exists(key)) return;
        const art = this.scene.add.graphics();
        art.fillStyle(0x121827);
        art.fillRect(13, 3, 22, 22);
        art.fillStyle(SKINS[color]);
        art.fillRect(15, 9, 18, 17);
        art.fillStyle(0x121827);
        art.fillRect(18, 14, 3, 3);
        art.fillRect(27, 14, 3, 3);
        art.fillStyle(HAIR[color]);
        art.fillRect(13, 3, 22, color === 3 ? 10 : 7);
        if (color === 1 || color === 4) {
            art.lineStyle(2, 0x131c29);
            art.strokeRect(16, 12, 8, 7);
            art.strokeRect(25, 12, 8, 7);
            art.lineBetween(24, 15, 25, 15);
        }
        if (color === 2) {
            art.fillStyle(0x385775);
            art.fillRect(11, 4, 27, 5);
            art.fillRect(14, 0, 20, 6);
        }
        if (color === 5) {
            art.fillStyle(HAIR[color]);
            art.fillRect(17, 21, 14, 5);
        }
        art.fillStyle(SHIRTS[color]);
        art.fillRect(13, 28, 22, 24);
        art.fillRect(7, frame ? 30 : 34, 6, 17);
        art.fillRect(35, frame ? 34 : 30, 6, 17);
        if (color === 4) {
            art.fillStyle(0x463453);
            art.fillRect(22, 29, 4, 18); // the manager's tie
        }
        if (color === 5) {
            art.fillStyle(0x26334d);
            art.fillRect(13, 30, 7, 22);
            art.fillRect(28, 30, 7, 22);
        }
        art.fillStyle(0x26334d);
        art.fillRect(14, 52, 8, frame ? 15 : 11);
        art.fillRect(26, 52, 8, frame ? 11 : 15);
        art.fillStyle(0xf5f5f5);
        art.fillRect(11, frame ? 65 : 61, 11, 5);
        art.fillRect(26, frame ? 61 : 65, 11, 5);
        art.generateTexture(key, 48, 72);
        art.destroy();
    }
}
