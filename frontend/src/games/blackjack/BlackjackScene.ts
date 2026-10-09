// PLACEHOLDER until the real blackjack lands (track D, docs/GAME_DESIGN.md): proves the
// Phaser pipeline, dialogue and scoring end to end. Replace the body, keep the constructor.

import { Scene } from "phaser";
import { pickLine } from "../shared/minigame";
import { GAME_WIDTH } from "../shared/createGame";
import type { MinigameResult } from "../shared/minigame";

interface BlackjackSceneArgs {
    playerName: string;
    dialogue: Record<string, string[]> | null;
    finish(result: MinigameResult): void;
}

// Outcomes the placeholder offers instead of real hands: [label, score, final bankroll].
const OUTCOMES: [string, number, number][] = [
    ["Go broke", 0, 0],
    ["Break even", 50, 1000],
    ["Double the stipend", 100, 2000],
];

export default class BlackjackScene extends Scene {
    private readonly args: BlackjackSceneArgs;

    constructor(args: BlackjackSceneArgs) {
        super("blackjack");
        this.args = args;
    }

    create() {
        const centerX = GAME_WIDTH / 2;
        this.add
            .text(centerX, 120, "Casino night", {
                fontSize: "64px",
                fontStyle: "bold",
                color: "#f5f5f5",
            })
            .setOrigin(0.5);
        this.add
            .text(
                centerX,
                210,
                pickLine(
                    this.args.dialogue,
                    "intro",
                    `Welcome, ${this.args.playerName}.`,
                ),
                {
                    fontSize: "28px",
                    color: "#d7d9e0",
                    wordWrap: { width: GAME_WIDTH - 200 },
                    align: "center",
                },
            )
            .setOrigin(0.5);

        OUTCOMES.forEach(([label, score, bankroll], index) => {
            const button = this.add
                .text(
                    centerX,
                    340 + index * 110,
                    `${label}  (score ${score})`,
                    {
                        fontSize: "36px",
                        color: "#111318",
                        backgroundColor: "#f2c14e",
                        padding: { x: 28, y: 16 },
                    },
                )
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true });
            button.on("pointerdown", () =>
                this.args.finish({ score, stats: { bankroll } }),
            );
        });
    }
}
