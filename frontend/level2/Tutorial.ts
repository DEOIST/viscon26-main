// The how-to-play window that opens over the table when a game starts: a screenshot and a few
// lines for each step. It is drawn by the engine like the rest of the table, so every shell
// shows it.

import type { GameObjects, Scene } from "phaser";
import {
    BLACKJACK_YELLOWS,
    DEALER_STANDS_AT,
    HANDS,
    MIN_BET,
    START_CHIPS,
} from "./config";
import { CENTER, HEIGHT, TUTORIAL, WIDTH } from "./layout";
import { COLORS } from "./textures";
import type { TutorialShot } from "./textures";
import { Button, FONT, label } from "./ui";
import { fill, TEXT } from "../src/misc/text";

const T = TEXT.blackjack.tutorial;

// One screenshot per step, in order. A step's title and paragraphs are in shared/text.json
// under the same name; the numbers in them come from config.ts.
const STEPS: TutorialShot[] = ["bet", "drop", "curve", "turn", "win"];
const NUMBERS = {
    minBet: MIN_BET,
    standsAt: DEALER_STANDS_AT,
    yellows: BLACKJACK_YELLOWS,
    hands: HANDS,
    chips: START_CHIPS,
};

const GOLD = "#f5c451";
const FRAME = 8; // the border around a screenshot

export default class Tutorial {
    private readonly scene: Scene;
    private readonly announce: (text: string) => void;
    private readonly onClose: () => void;
    private readonly shade: GameObjects.Rectangle;
    private readonly panel: GameObjects.Container;
    private readonly frame: GameObjects.Rectangle;
    private readonly shot: GameObjects.Image;
    private readonly caption: GameObjects.Text;
    private readonly title: GameObjects.Text;
    private readonly body: GameObjects.Text;
    private readonly dots: GameObjects.Arc[];
    private readonly skip: GameObjects.Text;
    private readonly back: Button;
    private readonly next: Button;
    private step = 0;
    private closed = false;

    // `announce` speaks each step for screen readers; `onClose` runs once the window is gone.
    constructor(
        scene: Scene,
        announce: (text: string) => void,
        onClose: () => void,
    ) {
        this.scene = scene;
        this.announce = announce;
        this.onClose = onClose;
        const { width, height, shot, text, controls } = TUTORIAL;

        // The shade also swallows clicks, so the table underneath waits.
        this.shade = scene.add
            .rectangle(CENTER.x, CENTER.y, WIDTH, HEIGHT, 0x000000, 0)
            .setDepth(95)
            .setInteractive();

        const box = scene.add
            .rectangle(0, 0, width, height, 0x0b2a18, 0.97)
            .setRounded(28)
            .setStrokeStyle(5, COLORS.gold);
        this.frame = scene.add.rectangle(shot.x, shot.y, 1, 1, COLORS.gold);
        this.shot = scene.add.image(shot.x, shot.y, `tutorial-${STEPS[0]}`);

        this.caption = label(scene, text.x, text.y, "", 22)
            .setOrigin(0, 0.5)
            .setAlpha(0.7);
        this.title = label(scene, text.x, text.y + 58, "", 50, GOLD).setOrigin(
            0,
            0.5,
        );
        this.body = scene.add.text(text.x, text.y + 112, "", {
            fontFamily: FONT,
            fontSize: "33px",
            fontStyle: "bold",
            color: "#fff6ec",
            wordWrap: { width: text.width },
            lineSpacing: 12,
        });

        this.dots = STEPS.map((_, i) =>
            scene.add.circle(text.x + 12 + i * 32, controls.y, 9, COLORS.gold),
        );
        this.skip = label(scene, controls.skipX, controls.y, T.skip, 24)
            .setOrigin(0, 0.5)
            .setAlpha(0.75)
            .setInteractive({ useHandCursor: true });
        this.skip.on("pointerover", () => this.skip.setAlpha(1));
        this.skip.on("pointerout", () => this.skip.setAlpha(0.75));
        this.skip.on("pointerdown", () => this.close());
        this.back = new Button(
            scene,
            controls.backX,
            controls.y,
            T.back,
            "blue",
            () => this.show(this.step - 1),
            170,
        );
        this.next = new Button(
            scene,
            controls.nextX,
            controls.y,
            T.next,
            "gold",
            () =>
                this.step < STEPS.length - 1
                    ? this.show(this.step + 1)
                    : this.close(),
            200,
        );

        this.panel = scene.add
            .container(CENTER.x, CENTER.y, [
                box,
                this.frame,
                this.shot,
                this.caption,
                this.title,
                this.body,
                ...this.dots,
                this.skip,
                this.back,
                this.next,
            ])
            .setDepth(96)
            .setScale(0.6)
            .setAlpha(0);
        this.back.show(true);
        this.next.show(true);
        this.show(0);

        scene.tweens.add({
            targets: this.shade,
            fillAlpha: 0.6,
            duration: 300,
        });
        scene.tweens.add({
            targets: this.panel,
            scale: 1,
            alpha: 1,
            duration: 420,
            ease: "Back.easeOut",
        });
    }

    private show(step: number) {
        if (this.closed || step < 0 || step >= STEPS.length) return;
        this.step = step;
        const shot = STEPS[step];
        const { title } = T.steps[shot];
        const text = T.steps[shot].text.map((line) => fill(line, NUMBERS));
        const at = { step: step + 1, steps: STEPS.length };
        const last = step === STEPS.length - 1;

        const box = TUTORIAL.shot;
        this.shot.setTexture(`tutorial-${shot}`);
        this.shot.setScale(
            Math.min(
                box.width / this.shot.width,
                box.height / this.shot.height,
            ),
        );
        this.frame.setSize(
            this.shot.displayWidth + FRAME,
            this.shot.displayHeight + FRAME,
        );

        this.caption.setText(fill(T.caption, at));
        this.title.setText(title);
        this.body.setText(text.join("\n\n"));
        this.dots.forEach((dot, i) => dot.setAlpha(i === step ? 1 : 0.3));
        this.back.setEnabled(step > 0);
        this.next.setLabel(last ? T.play : T.next);
        this.skip.setVisible(!last); // PLAY closes the window as well

        this.scene.tweens.add({
            targets: [this.shot, this.title, this.body],
            alpha: { from: 0, to: 1 },
            duration: 180,
        });
        this.announce(
            fill(T.announcement, { ...at, title, text: text.join(" ") }),
        );
    }

    private close() {
        if (this.closed) return;
        this.closed = true;
        this.scene.tweens.add({
            targets: this.shade,
            fillAlpha: 0,
            duration: 220,
        });
        this.scene.tweens.add({
            targets: this.panel,
            scale: 0.85,
            alpha: 0,
            duration: 220,
            ease: "Quad.easeIn",
            onComplete: () => {
                this.shade.destroy();
                this.panel.destroy(); // with everything in it
                this.onClose();
            },
        });
    }
}
