// A playing card built from the sprite sheets: frame, corner indices and either suit symbols
// (pips), the Ace's face or a court card's portrait. Building it from parts keeps each pip a
// separate sprite, so it can turn into a ball.

import { GameObjects } from "phaser";
import type { Scene } from "phaser";
import {
    CARD,
    CORNERS,
    CORNER_SUIT_SCALE,
    COURT_PEOPLE,
    PIPS,
    PIP_SCALE,
} from "./layout";
import type { Point } from "./layout";
import type { Card } from "./rules";

const art = (x: number, y: number): [number, number] => [
    x - CARD.w / 2,
    y - CARD.h / 2,
];

export default class CardView extends GameObjects.Container {
    readonly card: Card;
    private readonly front: GameObjects.Container;
    private readonly back: GameObjects.Image;
    private readonly shadow: GameObjects.Image;
    readonly symbols: GameObjects.Image[] = []; // what turns into balls
    faceUp: boolean;

    constructor(
        scene: Scene,
        x: number,
        y: number,
        card: Card,
        faceUp: boolean,
        scale: number,
    ) {
        super(scene, x, y);
        this.card = card;
        this.faceUp = faceUp;

        this.shadow = scene.add
            .image(10, 16, "frames", "card_front")
            .setTint(0x000000)
            .setAlpha(0.28);
        this.front = scene.add.container(0, 0);
        this.front.add(scene.add.image(0, 0, "frames", "card_front"));

        const { rank, suit } = card;
        CORNERS.number.forEach(([cx, cy]) =>
            this.front.add(
                scene.add.image(
                    ...art(cx, cy),
                    "numbers",
                    `num_${suit}_${rank}`,
                ),
            ),
        );
        CORNERS.suit.forEach(([cx, cy]) =>
            this.front.add(
                scene.add
                    .image(...art(cx, cy), "symbols", `symbol_${suit}`)
                    .setScale(CORNER_SUIT_SCALE),
            ),
        );

        const person = COURT_PEOPLE[rank];
        if (rank === "A") {
            this.symbols.push(scene.add.image(0, 0, "faces", `face_${suit}`));
        } else if (person) {
            this.front.add(scene.add.image(0, 0, "frames", `panel_${suit}`));
            this.symbols.push(
                scene.add.image(0, 0, "people", `${person}_${suit}`),
            );
        } else {
            for (const [px, py] of PIPS[rank] ?? []) {
                this.symbols.push(
                    scene.add
                        .image(...art(px, py), "symbols", `symbol_${suit}`)
                        .setScale(PIP_SCALE),
                );
            }
        }
        this.front.add(this.symbols);

        this.back = scene.add.image(0, 0, "back", "card_back");
        this.add([this.shadow, this.front, this.back]);
        this.showFace(faceUp);
        this.setScale(scale);
        scene.add.existing(this);
    }

    private showFace(faceUp: boolean) {
        this.faceUp = faceUp;
        this.front.setVisible(faceUp);
        this.back.setVisible(!faceUp);
    }

    // Squash to zero width, swap sides, stretch back.
    flip(duration = 260): Promise<void> {
        const scaleX = this.scaleX;
        return new Promise((resolve) => {
            this.scene.tweens.chain({
                targets: this,
                tweens: [
                    {
                        scaleX: 0,
                        scaleY: this.scaleY * 1.08,
                        duration: duration / 2,
                        ease: "Sine.easeIn",
                    },
                    {
                        scaleX,
                        scaleY: this.scaleY,
                        duration: duration / 2,
                        ease: "Back.easeOut",
                        onStart: () => this.showFace(!this.faceUp),
                    },
                ],
                onComplete: () => resolve(),
            });
        });
    }

    // World position of a symbol (the card is never rotated while dissolving).
    symbolPosition(symbol: GameObjects.Image): Point {
        return {
            x: this.x + symbol.x * this.scaleX,
            y: this.y + symbol.y * this.scaleY,
        };
    }

    // Fade the paper away so the balls appear to fall through the card.
    fadeBody(duration: number): Promise<void> {
        return new Promise((resolve) => {
            this.scene.tweens.add({
                targets: this,
                alpha: 0,
                scale: this.scale * 1.06,
                duration,
                ease: "Sine.easeIn",
                onComplete: () => resolve(),
            });
        });
    }
}
