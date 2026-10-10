// One Galton board on the table: the board art, its balls, the curve drawn on top, pin
// flashes, and a counter with the balls and yellow progress. Every ball's path, slot and
// colour come from the rules; this only animates.

import { Math as PhaserMath } from "phaser";
import type { GameObjects, Scene } from "phaser";
import {
    BOARD,
    COLUMNS,
    PIN_ROWS,
    columnX,
    curveHeight,
    pinAt,
    restY,
} from "./board";
import { BLACKJACK_YELLOWS, FUNNEL_MS, HOP_MS } from "./config";
import { BOARD_SCALE, CARD } from "./layout";
import type { Point } from "./layout";
import type { Ball, BallColor } from "./rules";
import { BALL_FRAMES, COLORS } from "./textures";
import { FONT } from "./ui";
import { fill, TEXT } from "../src/misc/text";

function ballCount(count: number): string {
    const balls = TEXT.blackjack.balls;
    return fill(count === 1 ? balls.one : balls.other, { count });
}

type Landing = {
    color: BallColor;
    decisive: "bust" | "blackjack" | null;
    at: Point;
};

export default class BoardView {
    readonly container: GameObjects.Container;
    private readonly scene: Scene;
    private readonly cardLayer: GameObjects.Container; // a card dissolving over the pins
    private readonly ballLayer: GameObjects.Container;
    private readonly flashes: GameObjects.Arc[][] = [];
    private readonly countText: GameObjects.Text;
    private readonly dots: GameObjects.Arc[] = [];
    private readonly burst: GameObjects.Particles.ParticleEmitter;
    private readonly stacks: GameObjects.Image[][] = Array.from(
        { length: COLUMNS },
        () => [],
    ); // landed balls per column, bottom first
    private landed = 0;
    private yellow = 0;
    private red = 0;
    private pending: Promise<void>[] = [];
    onLand: (landing: Landing) => void = () => {};

    constructor(
        scene: Scene,
        at: Point,
        counter: Point,
        frame: "board_9" | "board_9_red",
    ) {
        this.scene = scene;
        this.container = scene.add
            .container(at.x, at.y)
            .setScale(BOARD_SCALE)
            .setDepth(10);
        const shadow = scene.add
            .image(12, 18, "boards", frame)
            .setTint(0x000000)
            .setAlpha(0.3);
        const board = scene.add.image(0, 0, "boards", frame);
        this.container.add([shadow, board]);

        for (let row = 0; row < PIN_ROWS; row++) {
            this.flashes.push([]);
            for (let i = 0; i <= row; i++) {
                const pin = this.local(pinAt(row, i));
                const flash = scene.add
                    .circle(pin.x, pin.y, BOARD.pinRadius + 3, 0xffffff, 1)
                    .setAlpha(0);
                this.flashes[row].push(flash);
                this.container.add(flash);
            }
        }

        this.cardLayer = scene.add.container(0, 0);
        this.ballLayer = scene.add.container(0, 0);
        this.container.add([this.cardLayer, this.ballLayer, this.drawCurve()]);

        this.burst = scene.add.particles(0, 0, "dot", {
            speed: { min: 60, max: 220 },
            lifespan: { min: 280, max: 520 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 1, end: 0 },
            gravityY: 300,
            emitting: false,
        });
        this.burst.setDepth(45);

        this.countText = scene.add
            .text(counter.x, counter.y, ballCount(0), {
                fontFamily: FONT,
                fontSize: "30px",
                fontStyle: "bold",
                color: "#ffffff",
                stroke: "#0b3d24",
                strokeThickness: 6,
            })
            .setOrigin(0.5)
            .setDepth(50);
        for (let i = 0; i < BLACKJACK_YELLOWS; i++) {
            const x = counter.x + (i - (BLACKJACK_YELLOWS - 1) / 2) * 28;
            const dot = scene.add
                .circle(x, counter.y + 34, 10, COLORS.yellow, 1)
                .setStrokeStyle(3, 0x0b3d24);
            dot.setFillStyle(0x0b3d24, 0.55).setDepth(50);
            this.dots.push(dot);
        }
    }

    // The normal curve over the columns, as in the designer's overlay: a light fill and a
    // purple line with a white edge.
    private drawCurve(): GameObjects.Graphics {
        const points: PhaserMath.Vector2[] = [];
        for (let x = BOARD.left; x <= BOARD.right; x += 3) {
            const p = this.local({
                x,
                y: BOARD.floor - curveHeight(x - BOARD.pinX),
            });
            points.push(new PhaserMath.Vector2(p.x, p.y));
        }
        const floor = this.local({ x: 0, y: BOARD.floor }).y;
        const g = this.scene.add.graphics();
        g.fillStyle(0x9b7fe0, 0.16);
        g.fillPoints(
            [
                new PhaserMath.Vector2(points[0].x, floor),
                ...points,
                new PhaserMath.Vector2(points[points.length - 1].x, floor),
            ],
            true,
        );
        g.lineStyle(9, 0xffffff, 0.9);
        g.strokePoints(points);
        g.lineStyle(5, 0x8a6ad6, 1);
        g.strokePoints(points);
        return g;
    }

    // Board artwork coordinates (0..500, 0..700) -> container coordinates.
    private local(p: Point): Point {
        return { x: p.x - CARD.w / 2, y: p.y - CARD.h / 2 };
    }

    toWorld(p: Point): Point {
        const l = this.local(p);
        return {
            x: this.container.x + l.x * BOARD_SCALE,
            y: this.container.y + l.y * BOARD_SCALE,
        };
    }

    fromWorld(p: Point): Point {
        return {
            x: (p.x - this.container.x) / BOARD_SCALE + CARD.w / 2,
            y: (p.y - this.container.y) / BOARD_SCALE + CARD.h / 2,
        };
    }

    // Where a dissolving card sits, in world coordinates.
    get cardSpot(): Point {
        return this.toWorld({ x: 250, y: 232 });
    }

    // Take over a card that flew in, keeping its place and size on screen, so it sits above
    // the board art but below the balls.
    adopt(card: GameObjects.Container) {
        const p = this.local(this.fromWorld({ x: card.x, y: card.y }));
        card.setPosition(p.x, p.y)
            .setScale(card.scale / BOARD_SCALE)
            .setAngle(0);
        this.cardLayer.add(card);
    }

    // A neutral ball popping out of a card symbol (board container coordinates).
    spawn(p: Point, delay: number): GameObjects.Image {
        const ball = this.scene.add.image(p.x, p.y, "ball-neutral").setScale(0);
        this.ballLayer.add(ball);
        this.scene.tweens.add({
            targets: ball,
            scale: 1,
            duration: 260,
            delay,
            ease: "Back.easeOut",
        });
        return ball;
    }

    // Drop a spawned ball through the funnel and pins into its slot.
    launch(sprite: GameObjects.Image, ball: Ball, delay: number) {
        const start = { x: sprite.x, y: sprite.y };
        const funnel = this.local(BOARD.funnelTop);
        const contacts: Point[] = [];
        let index = 0;
        for (let row = 0; row < ball.path.length; row++) {
            const pin = this.local(pinAt(row, index));
            contacts.push({
                x: pin.x,
                y: pin.y - BOARD.pinRadius - BOARD.ballRadius,
            });
            if (ball.path[row]) index++;
        }
        const last = contacts[contacts.length - 1];
        const above = {
            x: this.local({ x: columnX(ball.column), y: 0 }).x,
            y: last.y + 18,
        };
        const rest = this.local({
            x: columnX(ball.column),
            y: restY(ball.slot, ball.slot + 1),
        });
        const fallMs = 120 + (rest.y - above.y) * 0.75;

        const segments = [
            FUNNEL_MS,
            110,
            ...contacts.slice(1).map(() => HOP_MS),
            HOP_MS,
            fallMs,
        ];
        const total = segments.reduce((a, b) => a + b, 0);
        let lastHop = -1;

        const position = (elapsed: number): Point => {
            let t = elapsed;
            let i = 0;
            while (i < segments.length - 1 && t > segments[i])
                t -= segments[i++];
            const u = Math.min(1, t / segments[i]);
            if (i === 0) {
                // Swoop from the card symbol into the funnel mouth.
                const e = PhaserMath.Easing.Sine.InOut(u);
                return {
                    x: PhaserMath.Linear(start.x, funnel.x, e),
                    y:
                        PhaserMath.Linear(start.y, funnel.y, e) -
                        Math.sin(u * Math.PI) * 40,
                };
            }
            if (i === 1) {
                const e = PhaserMath.Easing.Quadratic.In(u);
                return {
                    x: funnel.x,
                    y: PhaserMath.Linear(funnel.y, contacts[0].y, e),
                };
            }
            const hop = i - 2; // from contact[hop] to contact[hop + 1], or off the last pin
            if (hop !== lastHop && hop < contacts.length) {
                lastHop = hop;
                this.flashPin(
                    hop,
                    ball.path.slice(0, hop).filter(Boolean).length,
                );
            }
            if (hop < contacts.length - 1)
                return this.hop(contacts[hop], contacts[hop + 1], u);
            if (hop === contacts.length - 1) return this.hop(last, above, u);
            const e = PhaserMath.Easing.Quadratic.In(u);
            return { x: above.x, y: PhaserMath.Linear(above.y, rest.y, e) };
        };

        const done = new Promise<void>((resolve) => {
            this.scene.tweens.addCounter({
                from: 0,
                to: total,
                duration: total,
                delay,
                onUpdate: (tween) => {
                    const p = position(tween.getValue() ?? 0);
                    sprite.setPosition(p.x, p.y);
                },
                onComplete: () => {
                    sprite.setPosition(rest.x, rest.y);
                    this.land(sprite, ball);
                    resolve();
                },
            });
        });
        this.pending.push(done);
    }

    private hop(a: Point, b: Point, u: number): Point {
        return {
            x: PhaserMath.Linear(a.x, b.x, u),
            y: PhaserMath.Linear(a.y, b.y, u * u) - Math.sin(u * Math.PI) * 9,
        };
    }

    private flashPin(row: number, index: number) {
        const flash = this.flashes[row]?.[index];
        if (!flash) return;
        this.scene.tweens.killTweensOf(flash);
        flash.setAlpha(0.95).setScale(1);
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 1.7,
            duration: 240,
            ease: "Quad.easeOut",
        });
    }

    private land(sprite: GameObjects.Image, ball: Ball) {
        sprite.setTexture("balls", BALL_FRAMES[ball.color]);
        sprite.setScale(1.45, 0.7);
        this.scene.tweens.add({
            targets: sprite,
            scaleX: 1,
            scaleY: 1,
            duration: 260,
            ease: "Back.easeOut",
        });

        const stack = this.stacks[ball.column];
        stack[ball.slot] = sprite;
        this.pack(stack);
        const world = this.toWorld({
            x: columnX(ball.column),
            y: restY(ball.slot, stack.length),
        });
        this.burst.setParticleTint(COLORS[ball.color]);
        this.burst.explode(ball.color === "green" ? 6 : 12, world.x, world.y);

        this.landed++;
        this.countText.setText(ballCount(this.landed));
        this.scene.tweens.add({
            targets: this.countText,
            scale: { from: 1.25, to: 1 },
            duration: 200,
            ease: "Back.easeOut",
        });

        let decisive: Landing["decisive"] = null;
        if (ball.color === "yellow") {
            const dot = this.dots[this.yellow];
            if (dot) {
                dot.setFillStyle(COLORS.yellow, 1);
                this.scene.tweens.add({
                    targets: dot,
                    scale: { from: 2, to: 1 },
                    duration: 380,
                    ease: "Back.easeOut",
                });
            }
            this.yellow++;
            this.ring(world, COLORS.yellow);
            if (!this.red && this.yellow === BLACKJACK_YELLOWS)
                decisive = "blackjack";
        }
        // A red ball busts the board even after three yellow ones (rules.ts).
        if (ball.color === "red") {
            this.ring(world, COLORS.red);
            if (!this.red) decisive = "bust";
            this.red++;
        }
        this.onLand({ color: ball.color, decisive, at: world });
    }

    // Slide a column's balls to where they rest now that it holds one more: nothing moves
    // until the stack is taller than the bars, then it packs tighter (restY in board.ts).
    private pack(stack: GameObjects.Image[]) {
        stack.forEach((sprite, slot) => {
            const y = this.local({ x: 0, y: restY(slot, stack.length) }).y;
            if (Math.abs(sprite.y - y) < 0.5) return;
            this.scene.tweens.add({
                targets: sprite,
                y,
                duration: 140,
                ease: "Quad.easeOut",
            });
        });
    }

    private ring(at: Point, color: number) {
        const ring = this.scene.add
            .circle(at.x, at.y, 12)
            .setStrokeStyle(4, color)
            .setDepth(46);
        this.scene.tweens.add({
            targets: ring,
            scale: 3.2,
            alpha: 0,
            duration: 520,
            ease: "Cubic.easeOut",
            onComplete: () => ring.destroy(),
        });
    }

    // Resolves once every ball launched so far has landed.
    settled(): Promise<void> {
        return Promise.all(this.pending).then(() => undefined);
    }

    clear(): Promise<void> {
        this.pending = [];
        this.landed = 0;
        this.yellow = 0;
        this.red = 0;
        this.stacks.forEach((stack) => (stack.length = 0));
        this.countText.setText(ballCount(0));
        this.dots.forEach((dot) => dot.setFillStyle(0x0b3d24, 0.55));
        const balls = [...this.ballLayer.list];
        return new Promise((resolve) => {
            if (!balls.length) return resolve();
            this.scene.tweens.add({
                targets: balls,
                y: `+=${60}`,
                alpha: 0,
                duration: 320,
                delay: this.scene.tweens.stagger(8, {}),
                ease: "Quad.easeIn",
                onComplete: () => {
                    this.ballLayer.removeAll(true);
                    resolve();
                },
            });
        });
    }
}
