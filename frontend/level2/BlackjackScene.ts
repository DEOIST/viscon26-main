// The Galton Blackjack table (docs/GAME_DESIGN.md). Player input becomes a rules action; the
// resulting events (cards drawn, balls dropped, hand settled) are animated in order. Every
// outcome is decided in rules.ts.

import { Math as PhaserMath, Scene } from "phaser";
import type { GameObjects, Time } from "phaser";
import BoardView from "./BoardView";
import CardView from "./CardView";
import Tutorial from "./Tutorial";
import {
    BALL_GAP_MS,
    CHIP_VALUES,
    DEALER_LINE_MS,
    HANDS,
    MIN_BET,
    START_CHIPS,
} from "./config";
import {
    BET,
    BET_LABEL_DY,
    BOARD_SCALE,
    BUTTON_ROW,
    CARD_ON_BOARD,
    CENTER,
    CONTINUE_BUTTON,
    DEAL_BUTTON,
    DECK,
    DECK_SCALE,
    FAN_SCALE,
    HAND_LABEL,
    HEIGHT,
    PILE_SCALE,
    SEATS,
    SECRET,
    SPEECH,
    TRAY,
    TRAY_SCALE,
    WIDTH,
    WINNINGS_DX,
    ZOOM,
} from "./layout";
import type { Point } from "./layout";
import { builtInLines } from "./lines";
import type { DealerEvent } from "./lines";
import {
    betOf,
    canDouble,
    isOver,
    newDeck,
    newGame,
    play,
    result,
    shuffle,
} from "./rules";
import type { Action, Ball, Card, GameEvent, Reason, Who } from "./rules";
import { COLORS, loadAssets, makeTextures } from "./textures";
import {
    Button,
    banner,
    floatText,
    label,
    speechBubble,
    tween,
    wait,
} from "./ui";
import { pickLine } from "../src/games/shared/minigame";
import type { MinigameResult } from "../src/games/shared/minigame";

interface BlackjackSceneArgs {
    playerName: string;
    dialogue: Record<string, string[]> | null;
    finish(result: MinigameResult): void;
    announce(text: string): void; // for screen readers: the canvas itself says nothing
}

// What the dealer says when a hand ends.
const LINE_FOR_REASON: Record<Reason, DealerEvent> = {
    bust: "playerBust",
    blackjack: "playerBlackjack",
    "dealer-bust": "dealerBust",
    "dealer-blackjack": "lose",
    more: "win",
    fewer: "lose",
    equal: "push",
};

// Chips sit in two centred rows.
const traySpot = (i: number): Point => ({
    x: TRAY.x + ((i % TRAY.perRow) - (TRAY.perRow - 1) / 2) * TRAY.dx,
    y: TRAY.y + Math.floor(i / TRAY.perRow) * TRAY.dy,
});

export default class BlackjackScene extends Scene {
    private readonly args: BlackjackSceneArgs;
    private readonly lines: Record<DealerEvent, string[]>;
    private state = newGame();
    private shown = 0; // events of this hand already animated
    private locked = false;
    private boards!: Record<Who, BoardView>;
    private fans: Record<Who, CardView[]> = { player: [], dealer: [] };
    private secret: CardView | null = null;
    private pile: GameObjects.Image[] = [];
    private tray: GameObjects.Image[] = [];
    private betText!: GameObjects.Text;
    private chipsText!: GameObjects.Text;
    private handText!: GameObjects.Text;
    private shownChips = 0;
    private buttons!: Record<
        "deal" | "hit" | "stand" | "double" | "next",
        Button
    >;
    private confetti!: GameObjects.Particles.ParticleEmitter;
    private sparks!: GameObjects.Particles.ParticleEmitter;
    private loading: GameObjects.GameObject[] = [];
    private announced = "";
    private outcome = ""; // how the last hand ended, spoken with the next announcement
    private speech: GameObjects.Container | null = null;
    private speechTimer: Time.TimerEvent | null = null;
    private spoken = ""; // the dealer's last line, so it isn't repeated straight away

    constructor(args: BlackjackSceneArgs) {
        super("blackjack");
        this.args = args;
        this.lines = builtInLines(args.playerName);
    }

    // The table is laid out in its own units; the camera fits it onto the shared canvas.
    init() {
        this.cameras.main.setZoom(ZOOM).centerOn(CENTER.x, CENTER.y);
    }

    preload() {
        const track = this.add
            .rectangle(CENTER.x, CENTER.y, 604, 20, 0x000000, 0.4)
            .setRounded(10);
        const bar = this.add
            .rectangle(CENTER.x - 300, CENTER.y, 600, 14, COLORS.gold)
            .setOrigin(0, 0.5)
            .setRounded(7)
            .setScale(0, 1);
        this.loading = [
            track,
            bar,
            label(this, CENTER.x, CENTER.y - 50, "SHUFFLING THE DECK…", 34),
        ];
        this.load.on("progress", (value: number) => bar.setScale(value, 1));
        loadAssets(this);
    }

    create() {
        this.loading.forEach((o) => o.destroy());
        makeTextures(this);
        this.add.image(0, 0, "felt").setOrigin(0);

        this.boards = {
            dealer: new BoardView(
                this,
                SEATS.dealer.board,
                SEATS.dealer.counter,
                "board_9_red",
            ),
            player: new BoardView(
                this,
                SEATS.player.board,
                SEATS.player.counter,
                "board_9",
            ),
        };
        this.boards.player.onLand = (landing) =>
            this.onLand("player", landing.decisive, landing.at);
        this.boards.dealer.onLand = (landing) =>
            this.onLand("dealer", landing.decisive, landing.at);

        this.drawSeat("dealer", "DEALER", "avatar-dealer");
        this.drawSeat("player", "YOU", "avatar-player");
        this.drawDeck();

        this.handText = label(
            this,
            HAND_LABEL.x,
            HAND_LABEL.y,
            "",
            30,
        ).setDepth(50);
        this.betText = label(
            this,
            BET.x,
            BET.y + BET_LABEL_DY,
            "",
            26,
        ).setDepth(50);
        this.shownChips = this.state.chips;
        const avatar = SEATS.player.avatar;
        this.chipsText = label(
            this,
            avatar.x,
            avatar.y + 128,
            `CHIPS ${this.shownChips}`,
            32,
            "#f5c451",
        ).setDepth(50);

        const { x, y, dx } = BUTTON_ROW;
        this.buttons = {
            deal: new Button(
                this,
                DEAL_BUTTON.x,
                DEAL_BUTTON.y,
                "DEAL",
                "gold",
                () => this.deal(),
                200,
            ),
            hit: new Button(this, x - dx, y, "HIT", "green", () =>
                this.act({ type: "hit", random: Math.random }),
            ),
            stand: new Button(this, x, y, "STAND", "red", () =>
                this.act({ type: "stand", random: Math.random }),
            ),
            double: new Button(this, x + dx, y, "DOUBLE", "blue", () =>
                this.act({ type: "double", random: Math.random }),
            ),
            next: new Button(
                this,
                x,
                y,
                "NEXT HAND",
                "gold",
                () => this.act({ type: "next" }),
                230,
            ),
        };

        this.drawTray();

        this.sparks = this.add.particles(0, 0, "spark", {
            speed: { min: 80, max: 260 },
            lifespan: { min: 400, max: 800 },
            scale: { start: 0.9, end: 0 },
            rotate: { min: 0, max: 360 },
            emitting: false,
        });
        this.sparks.setDepth(85);
        this.confetti = this.add.particles(0, 0, "confetti", {
            x: { min: 0, max: WIDTH },
            y: -20,
            speedY: { min: 220, max: 420 },
            speedX: { min: -120, max: 120 },
            rotate: { start: 0, end: 540 },
            lifespan: 2600,
            gravityY: 160,
            tint: [COLORS.gold, COLORS.red, COLORS.green, 0x6fa8ee, 0xffffff],
            emitting: false,
        });
        this.confetti.setDepth(86);

        this.refresh();

        // Every game opens with the how-to-play window; the dealer greets the player once it
        // is closed, and the table's state is read out again after the tutorial's steps.
        new Tutorial(
            this,
            (text) => this.args.announce(text),
            () => {
                this.say("intro");
                this.announced = "";
                this.announce();
            },
        );
    }

    // --- Input -----------------------------------------------------------------

    private deal() {
        this.act({
            type: "deal",
            deck: shuffle(newDeck()),
            random: Math.random,
        });
    }

    private async act(action: Action) {
        if (this.locked) return;
        const before = this.state;
        const after = play(before, action);
        if (after === before) return;
        this.state = after;

        if (action.type === "chip") {
            this.chipIn(action.value);
            return this.refresh();
        }
        if (action.type === "unchip") {
            this.chipOut(action.index);
            return this.refresh();
        }

        this.locked = true;
        this.refresh();
        if (action.type === "next") {
            await this.clearTable();
            this.shown = 0;
            this.rebuildPile(true);
        } else {
            if (action.type === "deal") {
                this.showTray(false);
                this.say("deal");
            }
            if (action.type === "double") await this.doubleChips();
            const events = after.events.slice(this.shown);
            this.shown = after.events.length;
            for (const event of events) await this.animate(event);
        }
        this.locked = false;
        this.refresh();
        if (isOver(this.state)) this.showGameOver();
    }

    private refresh() {
        const s = this.state;
        const open = !this.locked;
        const { deal, hit, stand, double, next } = this.buttons;
        deal.show(s.phase === "betting");
        deal.setEnabled(open && betOf(s) >= MIN_BET);
        for (const b of [hit, stand])
            b.show(s.phase === "player").setEnabled(open);
        double.show(s.phase === "player");
        double.setEnabled(open && canDouble(s));
        next.show(s.phase === "settled" && !isOver(s) && open);
        next.setEnabled(open);

        const bet = betOf(s);
        // Follows the chips on the table, which stay until the hand's result is shown.
        const onTable = this.pile.length ? bet : 0;
        this.betText.setText(
            onTable
                ? `BET ${onTable}`
                : s.phase === "betting"
                  ? `PLACE YOUR BET · MIN ${MIN_BET}`
                  : "",
        );
        this.handText.setText(`HAND ${s.hand} / ${HANDS}`);
        this.tray.forEach((chip, i) => {
            const affordable =
                s.phase === "betting" && bet + CHIP_VALUES[i] <= s.chips;
            chip.setAlpha(affordable ? 1 : 0.35);
            if (affordable && open)
                chip.setInteractive({ useHandCursor: true });
            else chip.disableInteractive();
        });
        this.pile.forEach((chip) =>
            s.phase === "betting" && open
                ? chip.setInteractive({ useHandCursor: true })
                : chip.disableInteractive(),
        );
        if (s.phase !== "settled") this.countChips(s.chips - bet);
        if (open) this.announce();
    }

    private announce() {
        const s = this.state;
        const mine = s.player.board.balls;
        const theirs = s.dealer.board.balls;
        const text = {
            betting: `Hand ${s.hand} of ${HANDS}. Place your bet: ${betOf(s)} on the table, ${s.chips} chips in total.`,
            player: `Your turn: ${mine} balls against the dealer's ${theirs}. Hit, stand or double.`,
            settled: isOver(s)
                ? `${this.outcome} Game over. You finished with ${s.chips} chips.`
                : `${this.outcome} You have ${s.chips} chips. Next hand when you're ready.`,
        }[s.phase];
        if (text === this.announced) return;
        this.announced = text;
        this.args.announce(text);
    }

    private countChips(to: number) {
        const from = this.shownChips;
        if (from === to) return;
        this.shownChips = to;
        this.tweens.addCounter({
            from,
            to,
            duration: Math.min(900, 200 + Math.abs(to - from)),
            ease: "Cubic.easeOut",
            onUpdate: (t) =>
                this.chipsText.setText(
                    `CHIPS ${Math.round(t.getValue() ?? to)}`,
                ),
        });
    }

    // --- The dealer ----------------------------------------------------------------

    // A line from the story pack when the shell fetched one, otherwise a built-in line.
    private say(event: DealerEvent) {
        const line = pickLine(
            this.args.dialogue ?? this.lines,
            event,
            this.lines[event][0],
            this.spoken,
        );
        this.spoken = line;
        this.speechTimer?.remove();
        if (this.speech) {
            this.tweens.killTweensOf(this.speech);
            this.speech.destroy();
        }

        const bubble = speechBubble(
            this,
            SPEECH.x,
            SPEECH.y,
            SPEECH.width,
            SEATS.dealer.avatar.x - SPEECH.x,
            line,
        ).setAlpha(0);
        this.speech = bubble;
        this.tweens.add({
            targets: bubble,
            alpha: 1,
            y: { from: SPEECH.y + 12, to: SPEECH.y },
            duration: 220,
            ease: "Quad.easeOut",
        });
        this.speechTimer = this.time.delayedCall(DEALER_LINE_MS, () => {
            this.speech = null;
            this.tweens.add({
                targets: bubble,
                alpha: 0,
                duration: 300,
                onComplete: () => bubble.destroy(),
            });
        });
    }

    // --- Table furniture ---------------------------------------------------------

    private drawSeat(who: Who, name: string, texture: string) {
        const { avatar } = SEATS[who];
        const glow = this.add
            .circle(avatar.x, avatar.y, 96, COLORS.gold, 0.18)
            .setDepth(4);
        const image = this.add
            .image(avatar.x, avatar.y, texture)
            .setScale(0.86)
            .setDepth(5);
        this.tweens.add({
            targets: [image],
            y: avatar.y - 5,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
        this.tweens.add({
            targets: glow,
            scale: 1.12,
            alpha: 0.06,
            duration: 1600,
            yoyo: true,
            repeat: -1,
        });
        const ribbon = this.add
            .rectangle(avatar.x, avatar.y + 92, 150, 40, 0x0b2a18, 0.85)
            .setRounded(20)
            .setDepth(6);
        ribbon.setStrokeStyle(3, COLORS.gold);
        label(this, avatar.x, avatar.y + 92, name, 24, "#f5c451").setDepth(7);
    }

    private drawDeck() {
        for (let i = 4; i >= 0; i--) {
            this.add
                .image(DECK.x + i * 2, DECK.y + i * 3, "back", "card_back")
                .setScale(DECK_SCALE)
                .setDepth(20)
                .setTint(i ? 0xc8c8d8 : 0xffffff);
        }
    }

    private drawTray() {
        CHIP_VALUES.forEach((value, i) => {
            const { x, y } = traySpot(i);
            const chip = this.add
                .image(x, y, "chips", `chip_${value}`)
                .setScale(TRAY_SCALE)
                .setDepth(50);
            chip.on("pointerover", () =>
                this.tweens.add({
                    targets: chip,
                    y: y - 10,
                    scale: TRAY_SCALE * 1.08,
                    duration: 120,
                }),
            );
            chip.on("pointerout", () =>
                this.tweens.add({
                    targets: chip,
                    y,
                    scale: TRAY_SCALE,
                    duration: 120,
                }),
            );
            chip.on("pointerdown", () => this.act({ type: "chip", value }));
            this.tray.push(chip);
        });
    }

    private showTray(visible: boolean) {
        this.tray.forEach((chip, i) =>
            this.tweens.add({
                targets: chip,
                y: traySpot(i).y + (visible ? 0 : 260),
                duration: 380,
                delay: i * 30,
                ease: visible ? "Back.easeOut" : "Back.easeIn",
            }),
        );
    }

    // --- Chips -------------------------------------------------------------------

    private pileSpot(index: number, count: number): Point {
        const step = Math.min(8, 110 / Math.max(1, count));
        return { x: BET.x, y: BET.y + 30 - index * step };
    }

    private rebuildPile(fromPlayer = false) {
        this.pile.forEach((chip) => chip.destroy());
        const bet = this.state.bet;
        this.pile = bet.map((value, i) => {
            const spot = this.pileSpot(i, bet.length);
            const chip = this.add
                .image(spot.x, spot.y, "chips", `chip_${value}`)
                .setScale(PILE_SCALE)
                .setDepth(30 + i);
            chip.on("pointerdown", () =>
                this.act({ type: "unchip", index: i }),
            );
            if (fromPlayer) {
                const { avatar } = SEATS.player;
                chip.setPosition(avatar.x, avatar.y);
                this.tweens.add({
                    targets: chip,
                    x: spot.x,
                    y: spot.y,
                    duration: 420,
                    delay: i * 40,
                    ease: "Cubic.easeOut",
                });
            }
            return chip;
        });
    }

    private chipIn(value: number) {
        const from = this.tray[CHIP_VALUES.indexOf(value)];
        this.rebuildPile();
        const top = this.pile[this.pile.length - 1];
        const spot = { x: top.x, y: top.y };
        top.setPosition(from.x, from.y).setScale(TRAY_SCALE);
        this.tweens.add({
            targets: top,
            x: spot.x,
            y: spot.y,
            scale: PILE_SCALE,
            duration: 300,
            ease: "Back.easeOut",
        });
        this.tweens.add({
            targets: this.betText,
            scale: { from: 1.25, to: 1 },
            duration: 220,
            ease: "Back.easeOut",
        });
    }

    private chipOut(index: number) {
        const leaving = this.pile[index];
        const home =
            this.tray[CHIP_VALUES.indexOf(Number(leaving.frame.name.slice(5)))];
        const ghost = this.add
            .image(leaving.x, leaving.y, "chips", leaving.frame.name)
            .setScale(PILE_SCALE)
            .setDepth(60);
        this.tweens.add({
            targets: ghost,
            x: home.x,
            y: home.y,
            scale: TRAY_SCALE,
            duration: 280,
            ease: "Cubic.easeOut",
            onComplete: () => ghost.destroy(),
        });
        this.rebuildPile();
    }

    private async doubleChips() {
        const { avatar } = SEATS.player;
        floatText(this, BET.x, BET.y - 80, "DOUBLE!", "#6fa8ee");
        this.rebuildPile();
        const half = this.pile.length / 2;
        await Promise.all(
            this.pile.slice(half).map((chip, i) => {
                const spot = { x: chip.x, y: chip.y };
                chip.setPosition(avatar.x, avatar.y);
                return tween(this, {
                    targets: chip,
                    ...spot,
                    duration: 360,
                    delay: i * 40,
                    ease: "Cubic.easeOut",
                });
            }),
        );
    }

    // Send the bet pile (plus any winnings) where it belongs after a hand.
    private async payOut(payout: number) {
        const dealer = SEATS.dealer.avatar;
        const player = SEATS.player.avatar;
        if (payout > 0) {
            const winnings = this.pile.map((chip) =>
                this.add
                    .image(dealer.x, dealer.y, "chips", chip.frame.name)
                    .setScale(PILE_SCALE)
                    .setDepth(29),
            );
            await Promise.all(
                winnings.map((chip, i) =>
                    tween(this, {
                        targets: chip,
                        x: BET.x + WINNINGS_DX,
                        y: this.pile[i].y,
                        duration: 420,
                        delay: i * 50,
                        ease: "Cubic.easeOut",
                    }),
                ),
            );
            this.pile.push(...winnings);
        }
        const to = payout < 0 ? dealer : player;
        await Promise.all(
            this.pile.map((chip, i) =>
                tween(this, {
                    targets: chip,
                    x: to.x,
                    y: to.y,
                    scale: 0.15,
                    alpha: 0.4,
                    duration: 480,
                    delay: i * 35,
                    ease: "Cubic.easeIn",
                }),
            ),
        );
        this.pile.forEach((chip) => chip.destroy());
        this.pile = [];
    }

    // --- Cards and balls -----------------------------------------------------------

    private async animate(event: GameEvent) {
        switch (event.type) {
            case "draw": {
                const board = this.boards[event.to];
                const card = await this.fly(
                    event.card,
                    board.cardSpot,
                    BOARD_SCALE * CARD_ON_BOARD,
                );
                board.adopt(card);
                await card.flip();
                return this.dissolve(card, event.to, event.balls);
            }
            case "secret":
                this.secret = await this.fly(event.card, SECRET, DECK_SCALE);
                return;
            case "reveal": {
                const card = this.secret!;
                this.secret = null;
                await card.flip();
                const board = this.boards.dealer;
                await tween(this, {
                    targets: card,
                    ...board.cardSpot,
                    scale: BOARD_SCALE * CARD_ON_BOARD,
                    duration: 360,
                    ease: "Cubic.easeInOut",
                });
                board.adopt(card);
                return this.dissolve(card, "dealer", event.balls);
            }
            case "settle":
                return this.settle(event);
        }
    }

    // A face-down card slides off the deck to `to`.
    private async fly(card: Card, to: Point, scale: number): Promise<CardView> {
        const view = new CardView(
            this,
            DECK.x,
            DECK.y,
            card,
            false,
            DECK_SCALE,
        ).setDepth(40);
        await tween(this, {
            targets: view,
            x: to.x,
            y: to.y,
            scale,
            angle: { from: PhaserMath.Between(-18, 18), to: 0 },
            duration: 400,
            ease: "Cubic.easeOut",
        });
        return view;
    }

    // The card's symbols pop into balls, the paper fades and the balls fall.
    private async dissolve(card: CardView, who: Who, balls: Ball[]) {
        const board = this.boards[who];
        const symbols = card.symbols;
        const burst = symbols.length === 1 && balls.length > 1; // a court card's portrait

        if (burst) {
            await tween(this, {
                targets: card,
                angle: 6,
                duration: 60,
                yoyo: true,
                repeat: 3,
                ease: "Sine.easeInOut",
            });
            card.setAngle(0);
        }

        const sprites = balls.map((_, i) => {
            const symbol = symbols[Math.min(i, symbols.length - 1)];
            const at = card.symbolPosition(symbol);
            const ring = burst ? (i / balls.length) * Math.PI * 2 : 0;
            const spread = burst ? 120 : 0;
            return board.spawn(
                {
                    x: at.x + Math.cos(ring) * spread,
                    y: at.y + Math.sin(ring) * spread * 1.2,
                },
                i * 30,
            );
        });
        symbols.forEach((symbol, i) =>
            this.tweens.add({
                targets: symbol,
                scale: symbol.scale * 1.35,
                alpha: 0,
                duration: 240,
                delay: i * 30,
                ease: "Back.easeIn",
            }),
        );
        const center = board.cardSpot;
        this.sparks.setParticleTint(0xffffff);
        this.sparks.explode(burst ? 24 : 8 + balls.length, center.x, center.y);

        await wait(this, 180);
        const fade = card.fadeBody(360);
        balls.forEach((ball, i) =>
            board.launch(sprites[i], ball, 220 + i * BALL_GAP_MS),
        );
        await fade;
        card.destroy();
        this.addToFan(who, card.card);
        await wait(this, Math.max(0, balls.length * BALL_GAP_MS - 260));
    }

    private addToFan(who: Who, card: Card) {
        const fan = SEATS[who].fan;
        const i = this.fans[who].length;
        const view = new CardView(
            this,
            fan.x + i * fan.dx,
            fan.y,
            card,
            true,
            0,
        ).setDepth(20 + i);
        view.setAngle((i % 2 ? 1 : -1) * 4);
        this.tweens.add({
            targets: view,
            scale: FAN_SCALE,
            duration: 320,
            ease: "Back.easeOut",
        });
        this.fans[who].push(view);
    }

    // The moment a decisive ball lands. The third yellow ball is only cheered when the board
    // ends as a blackjack: `state` already knows whether a red ball follows from the same card.
    private onLand(who: Who, decisive: "bust" | "blackjack" | null, at: Point) {
        if (decisive === "bust") {
            this.cameras.main.shake(260, 0.008);
            this.cameras.main.flash(180, 238, 90, 120, false);
            floatText(this, at.x, at.y - 30, "RED!", "#ee5a78");
        } else if (
            decisive === "blackjack" &&
            this.state[who].board.event === "blackjack"
        ) {
            this.cameras.main.flash(220, 255, 214, 120, false);
            this.sparks.setParticleTint(COLORS.gold);
            this.sparks.explode(30, at.x, at.y);
            floatText(this, at.x, at.y - 30, "3 YELLOW!", "#ffc94d");
        }
    }

    private async settle(event: Extract<GameEvent, { type: "settle" }>) {
        await Promise.all([
            this.boards.player.settled(),
            this.boards.dealer.settled(),
        ]);
        if (this.secret) {
            await this.secret.flip(); // the hand ended before the dealer's turn
        }
        await wait(this, 200);

        const mine = this.state.player.board.balls;
        const theirs = this.state.dealer.board.balls;
        const amount = Math.abs(event.payout);
        const [title, subtitle, color] = {
            bust: ["BUST!", `A red ball. You lose ${amount}`, "#ee5a78"],
            blackjack: [
                "BLACKJACK!",
                `Three yellow balls pay 3:2  +${amount}`,
                "#ffc94d",
            ],
            "dealer-bust": [
                "DEALER BUSTS!",
                `A red ball on the dealer's board  +${amount}`,
                "#6ccfa6",
            ],
            "dealer-blackjack": [
                "DEALER BLACKJACK",
                `Three yellow balls for the house  −${amount}`,
                "#ee5a78",
            ],
            more: [
                "YOU WIN!",
                `${mine} balls beat ${theirs}  +${amount}`,
                "#6ccfa6",
            ],
            fewer: [
                "DEALER WINS",
                `${mine} balls against ${theirs}  −${amount}`,
                "#ee5a78",
            ],
            equal: [
                "PUSH",
                `${mine} balls each. Your bet comes back`,
                "#ffffff",
            ],
        }[event.reason];

        this.outcome = `${title} ${subtitle}.`;
        this.say(LINE_FOR_REASON[event.reason]);
        if (event.payout > 0)
            this.confetti.explode(event.outcome === "blackjack" ? 160 : 70);
        await Promise.all([
            banner(this, title, subtitle, color),
            this.payOut(event.payout),
        ]);
        this.countChips(this.state.chips);
    }

    private async clearTable() {
        const cards = [
            ...this.fans.player,
            ...this.fans.dealer,
            ...(this.secret ? [this.secret] : []),
        ];
        this.secret = null;
        this.fans = { player: [], dealer: [] };
        await Promise.all([
            this.boards.player.clear(),
            this.boards.dealer.clear(),
            ...cards.map((card, i) =>
                tween(this, {
                    targets: card,
                    x: DECK.x,
                    y: -200,
                    angle: 90,
                    duration: 420,
                    delay: i * 30,
                    ease: "Cubic.easeIn",
                }).then(() => card.destroy()),
            ),
        ]);
        this.showTray(true);
    }

    private showGameOver() {
        const chips = this.state.chips;
        const final = result(this.state);
        const shade = this.add
            .rectangle(CENTER.x, CENTER.y, WIDTH, HEIGHT, 0x000000, 0)
            .setDepth(90)
            .setInteractive();
        const panel = this.add
            .container(CENTER.x, CENTER.y)
            .setDepth(91)
            .setScale(0.6)
            .setAlpha(0);
        const box = this.add
            .rectangle(0, 0, 640, 400, 0x0b2a18, 0.95)
            .setRounded(28)
            .setStrokeStyle(5, COLORS.gold);
        const diff = chips - START_CHIPS;
        panel.add([
            box,
            label(this, 0, -130, "GAME OVER", 64, "#f5c451"),
            label(this, 0, -44, `You finished with ${chips} chips`, 34),
            label(
                this,
                0,
                6,
                diff >= 0 ? `+${diff} on the night` : `${diff} on the night`,
                28,
                diff > 0 ? "#6ccfa6" : "#ee5a78",
            ),
            label(this, 0, 52, `SCORE ${final.score} / 100`, 26, "#f5c451"),
        ]);
        this.tweens.add({ targets: shade, fillAlpha: 0.55, duration: 400 });
        this.tweens.add({
            targets: panel,
            scale: 1,
            alpha: 1,
            duration: 420,
            ease: "Back.easeOut",
        });
        if (diff > 0) this.confetti.explode(180);

        if (chips < MIN_BET) this.say("broke");
        else if (diff > 0) this.say("cashOut");
        this.speech?.setDepth(93); // the dealer's last word stays above the shade

        // The shell saves the result and leaves the page; the game only reports it, once.
        const done = new Button(
            this,
            CONTINUE_BUTTON.x,
            CONTINUE_BUTTON.y,
            "CONTINUE",
            "gold",
            () => {
                done.setEnabled(false);
                this.args.finish(final);
            },
            240,
        ).setDepth(92);
        done.show(true);
    }
}
