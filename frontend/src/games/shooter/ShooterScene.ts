// PLACEHOLDER until the real shooter lands (tracks E and F, docs/SHOOTER_CV.md): a 15-second
// mouse round that proves the game loop, pointer input, hit testing and scoring end to end.
// The finger-gun InputSource plugs in where the pointer is read today.

import { Scene } from "phaser";
import { pickLine } from "../shared/minigame";
import { GAME_HEIGHT, GAME_WIDTH } from "../shared/createGame";
import type { GameObjects } from "phaser";
import type { MinigameResult } from "../shared/minigame";

interface ShooterSceneArgs {
    playerName: string;
    dialogue: Record<string, string[]> | null;
    finish(result: MinigameResult): void;
}

const ROUND_SECONDS = 15;
const TARGET_RADIUS = 48;
const POINTS_PER_HIT = 10; // 10 hits = score 100

export default class ShooterScene extends Scene {
    private readonly args: ShooterSceneArgs;
    private target!: GameObjects.Arc;
    private hud!: GameObjects.Text;
    private hits = 0;
    private shots = 0;
    private secondsLeft = ROUND_SECONDS;

    constructor(args: ShooterSceneArgs) {
        super("shooter");
        this.args = args;
    }

    create() {
        this.add
            .text(
                GAME_WIDTH / 2,
                40,
                pickLine(
                    this.args.dialogue,
                    "intro",
                    `Shoot the questions, ${this.args.playerName}!`,
                ),
                { fontSize: "28px", color: "#f5f5f5" },
            )
            .setOrigin(0.5, 0);
        this.hud = this.add.text(24, GAME_HEIGHT - 56, "", {
            fontSize: "28px",
            color: "#f2c14e",
        });
        this.target = this.add.circle(0, 0, TARGET_RADIUS, 0xf2c14e);
        this.moveTarget();
        this.updateHud();

        this.input.on("pointerdown", (pointer: { x: number; y: number }) =>
            this.shoot(pointer.x, pointer.y),
        );
        this.time.addEvent({
            delay: 1000,
            repeat: ROUND_SECONDS - 1,
            callback: () => this.tick(),
        });
    }

    private shoot(x: number, y: number) {
        this.shots += 1;
        const distance = Math.hypot(x - this.target.x, y - this.target.y);
        if (distance <= TARGET_RADIUS) {
            this.hits += 1;
            this.moveTarget();
        }
        this.updateHud();
    }

    private tick() {
        this.secondsLeft -= 1;
        this.updateHud();
        if (this.secondsLeft === 0) {
            this.args.finish({
                score: Math.min(100, this.hits * POINTS_PER_HIT),
                stats: { hits: this.hits, shots: this.shots },
            });
        }
    }

    private moveTarget() {
        const margin = TARGET_RADIUS * 2;
        this.target.setPosition(
            margin + Math.random() * (GAME_WIDTH - 2 * margin),
            margin * 2 + Math.random() * (GAME_HEIGHT - 4 * margin),
        );
    }

    private updateHud() {
        this.hud.setText(
            `Hits ${this.hits}   Shots ${this.shots}   ${this.secondsLeft}s`,
        );
    }
}
