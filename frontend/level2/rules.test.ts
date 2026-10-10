import { describe, expect, it } from "vitest";
import {
    type Card,
    type Rank,
    type State,
    ballsOn,
    betOf,
    canDouble,
    dropCard,
    emptyBoard,
    isOver,
    newDeck,
    newGame,
    play,
    result,
    scoreOf,
    shuffle,
    slotColor,
} from "./rules";

const card = (rank: Rank): Card => ({ rank, suit: "spades" });

// A random source that sends ball after ball into the given columns, in turn:
// a ball bounces right (>= 0.5) `column` times, then left for the other rows.
function into(...columns: number[]) {
    let ball = 0;
    let row = 0;
    return () => {
        const column = columns[ball % columns.length];
        const right = row < column;
        row = (row + 1) % 8;
        if (row === 0) ball++;
        return right ? 0.9 : 0.1;
    };
}
const MIDDLE = into(4);
// Spreads balls over columns 2-6 so a dozen or so stay green.
const spread = () => into(2, 3, 4, 5, 6, 3, 4, 5);

// Deck order: player, dealer (open), player, dealer (secret), then draws.
const deck = (...ranks: Rank[]) => ranks.map(card);

function bet(state: State, ...chips: number[]): State {
    return chips.reduce((s, value) => play(s, { type: "chip", value }), state);
}

function dealt(ranks: Rank[], random = MIDDLE, chips = [10]): State {
    return play(bet(newGame(), ...chips), {
        type: "deal",
        deck: deck(...ranks),
        random,
    });
}

describe("cards", () => {
    it.each<[Rank, number]>([
        ["A", 1],
        ["2", 2],
        ["7", 7],
        ["10", 10],
        ["J", 10],
        ["Q", 10],
        ["K", 10],
    ])("%s drops %i balls", (rank, balls) => {
        expect(ballsOn(card(rank))).toBe(balls);
    });

    it("has 52 different cards without jokers", () => {
        const cards = newDeck();
        expect(new Set(cards.map((c) => `${c.rank} ${c.suit}`)).size).toBe(52);
        expect(cards.filter((c) => c.rank === "K")).toHaveLength(4);
    });

    it("shuffles without losing or copying cards", () => {
        let seed = 1;
        const random = () =>
            ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        const shuffled = shuffle(newDeck(), random);
        const names = (cards: Card[]) =>
            cards.map((c) => `${c.rank} ${c.suit}`).sort();
        expect(shuffled).not.toEqual(newDeck());
        expect(names(shuffled)).toEqual(names(newDeck()));
    });
});

describe("the board", () => {
    it.each<[number, number, string]>([
        [4, 0, "green"],
        [4, 5, "green"],
        [4, 6, "yellow"],
        [4, 7, "red"],
        [3, 5, "yellow"],
        [2, 1, "green"],
        [2, 2, "yellow"],
        [2, 3, "red"],
        [1, 0, "green"],
        [1, 1, "yellow"],
        [1, 2, "red"],
        [7, 0, "green"],
        [0, 0, "yellow"],
        [0, 1, "red"],
        [8, 1, "red"],
    ])("colours ball %#: column %i, slot %i is %s", (column, slot, color) => {
        expect(slotColor(column, slot)).toBe(color);
    });

    it("lands each ball in the column its bounces lead to and stacks it", () => {
        const { board, balls } = dropCard(
            emptyBoard(),
            card("3"),
            into(3, 3, 6),
        );
        expect(balls.map((b) => [b.column, b.slot])).toEqual([
            [3, 0],
            [3, 1],
            [6, 0],
        ]);
        expect(balls[0].path).toEqual([
            true,
            true,
            true,
            false,
            false,
            false,
            false,
            false,
        ]);
        expect(board).toMatchObject({
            columns: [0, 0, 0, 2, 0, 0, 1, 0, 0],
            balls: 3,
        });
    });

    it("goes bust on the first red ball", () => {
        const { board, balls } = dropCard(emptyBoard(), card("2"), into(0));
        expect(balls.map((b) => b.color)).toEqual(["yellow", "red"]);
        expect(board.event).toBe("bust");
    });

    // Columns 0 and 8 start yellow; column 1 holds one green, then a yellow.
    it("makes a blackjack with the third yellow ball", () => {
        const { board, balls } = dropCard(
            emptyBoard(),
            card("4"),
            into(0, 8, 1, 1),
        );
        expect(balls.map((b) => b.color)).toEqual([
            "yellow",
            "yellow",
            "green",
            "yellow",
        ]);
        expect(board).toMatchObject({ yellow: 3, red: 0, event: "blackjack" });
    });

    it("stays bust when yellow balls follow a red one", () => {
        // yellow, red (bust), yellow, green, yellow
        const { board } = dropCard(
            emptyBoard(),
            card("5"),
            into(0, 0, 8, 1, 1),
        );
        expect(board).toMatchObject({ yellow: 3, red: 1, event: "bust" });
    });

    it("is a bust, not a blackjack, when a red ball follows three yellow ones", () => {
        // yellow, yellow, green, yellow (three), then red in column 8
        const { board, balls } = dropCard(
            emptyBoard(),
            card("5"),
            into(0, 8, 1, 1, 8),
        );
        expect(balls.at(-1)?.color).toBe("red");
        expect(board).toMatchObject({ yellow: 3, red: 1, event: "bust" });
    });
});

describe("betting", () => {
    it("adds chips to the bet and takes them back", () => {
        const state = bet(newGame(), 25, 5, 100);
        expect(state.bet).toEqual([25, 5, 100]);
        expect(betOf(state)).toBe(130);
        expect(play(state, { type: "unchip", index: 1 }).bet).toEqual([
            25, 100,
        ]);
    });

    it("refuses chips the player can't cover", () => {
        const state = bet(newGame(), 100, 100, 100);
        expect(betOf(state)).toBe(300);
        expect(play(state, { type: "chip", value: 1 })).toBe(state);
        expect(play(newGame(), { type: "chip", value: 500 }).bet).toEqual([]);
        expect(play(newGame(), { type: "chip", value: 7 }).bet).toEqual([]);
    });

    it("needs the minimum bet before dealing", () => {
        const low = bet(newGame(), 5, 1);
        expect(
            play(low, {
                type: "deal",
                deck: deck("2", "3", "4", "5"),
                random: MIDDLE,
            }),
        ).toBe(low);
    });
});

describe("the opening deal", () => {
    it("drops two cards for the player and one open card for the dealer", () => {
        const state = dealt(["2", "4", "3", "5"]);
        expect(state.phase).toBe("player");
        expect(state.events.map((e) => e.type)).toEqual([
            "draw",
            "draw",
            "draw",
            "secret",
        ]);
        expect(state.player.board.balls).toBe(5);
        expect(state.dealer.board.balls).toBe(4);
        expect(state.secret).toEqual(card("5"));
    });

    it("ends the hand on the card that busts the player", () => {
        // the player's first card drops both balls into column 0: yellow, then red
        const state = dealt(["2", "4", "A", "5"], into(0), [100]);
        expect(state).toMatchObject({
            phase: "settled",
            outcome: "lose",
            chips: 200,
            secret: null,
        });
        expect(state.events.map((e) => e.type)).toEqual(["draw", "settle"]);
        expect(state.events.at(-1)).toMatchObject({
            type: "settle",
            reason: "bust",
            payout: -100,
        });
        expect(state.dealer.plays).toHaveLength(0);
    });

    it("busts the dealer on its open card and pays at once", () => {
        // the player's ace lands in the middle; the dealer's 2 drops into column 0: yellow, red
        const state = dealt(["A", "2", "K", "5"], into(4, 0, 0));
        expect(state).toMatchObject({
            phase: "settled",
            outcome: "win",
            chips: 310,
            secret: null,
        });
        expect(state.events.map((e) => e.type)).toEqual([
            "draw",
            "draw",
            "settle",
        ]);
        expect(state.events.at(-1)).toMatchObject({ reason: "dealer-bust" });
        expect(state.player.plays).toHaveLength(1);
    });
});

describe("the player's turn", () => {
    it("draws onto the player's board", () => {
        const state = play(dealt(["2", "4", "3", "5", "A"]), {
            type: "hit",
            random: MIDDLE,
        });
        expect(state.phase).toBe("player");
        expect(state.player.board.balls).toBe(6);
        expect(state.events.at(-1)).toMatchObject({
            type: "draw",
            to: "player",
            card: card("A"),
        });
    });

    it("loses the bet on a red ball", () => {
        // 5 balls in the middle column already; 3 more reach slot 7, which is red
        const state = play(dealt(["2", "4", "3", "5", "3"]), {
            type: "hit",
            random: MIDDLE,
        });
        expect(state).toMatchObject({
            phase: "settled",
            outcome: "lose",
            chips: 290,
        });
    });

    it("pays 3:2 on the third yellow ball", () => {
        const opening = dealt(["A", "4", "A", "5", "4"], into(4), [10, 10]);
        const state = play(opening, { type: "hit", random: into(0, 8, 1, 1) });
        expect(state).toMatchObject({
            phase: "settled",
            outcome: "blackjack",
            chips: 330,
        });
        expect(state.events.at(-1)).toMatchObject({
            type: "settle",
            reason: "blackjack",
            payout: 30,
        });
    });

    it("loses the bet when the card with the third yellow ball also drops a red one", () => {
        const opening = dealt(["A", "4", "A", "5", "5"], into(4), [10, 10]);
        const state = play(opening, {
            type: "hit",
            random: into(0, 8, 1, 1, 8),
        });
        expect(state.player.board).toMatchObject({ yellow: 3, red: 1 });
        expect(state).toMatchObject({
            phase: "settled",
            outcome: "lose",
            chips: 280,
        });
        expect(state.events.at(-1)).toMatchObject({ reason: "bust" });
    });
});

describe("the dealer's turn", () => {
    it("reveals the secret card, then draws until it reaches its limit", () => {
        // dealer: 4 open + 5 secret = 9 balls, draws a 6 -> 15, stops (8 is never drawn)
        const opening = dealt(["2", "4", "3", "5", "6", "8"], into(3, 4, 5));
        const state = play(opening, { type: "stand", random: into(3, 4, 5) });
        expect(state.events.slice(4).map((e) => e.type)).toEqual([
            "reveal",
            "draw",
            "settle",
        ]);
        expect(state.dealer.board.balls).toBe(15);
        expect(state.deck[0]).toEqual(card("8"));
    });

    it("makes the dealer draw on 9 balls and stand on 10", () => {
        const random = spread();
        const state = play(dealt(["2", "4", "10", "5", "A", "K"], random), {
            type: "stand",
            random,
        });
        expect(state.dealer.plays.map((p) => p.card.rank)).toEqual([
            "4",
            "5",
            "A",
        ]);
        expect(state.dealer.board.balls).toBe(10);
    });

    it("pays the player when the dealer goes red", () => {
        // dealer's balls all fall into column 0 after the opening: red at once
        const opening = dealt(["2", "4", "3", "5"], MIDDLE);
        const state = play(opening, { type: "stand", random: into(0) });
        expect(state).toMatchObject({ outcome: "win", chips: 310 });
        expect(state.events.at(-1)).toMatchObject({ reason: "dealer-bust" });
    });

    it("takes the bet when the dealer gets three yellow balls", () => {
        // secret A: yellow; the dealer then draws a 3: yellow, green, yellow (blackjack)
        const opening = dealt(["2", "4", "3", "A", "3"], MIDDLE);
        const state = play(opening, {
            type: "stand",
            random: into(0, 8, 1, 1),
        });
        expect(state).toMatchObject({ outcome: "lose", chips: 290 });
        expect(state.events.at(-1)).toMatchObject({
            reason: "dealer-blackjack",
        });
    });

    it("busts the dealer when a red ball follows its three yellow ones", () => {
        // secret A: yellow; the dealer then draws a 4: yellow, green, yellow, red
        const opening = dealt(["2", "4", "3", "A", "4"], MIDDLE);
        const state = play(opening, {
            type: "stand",
            random: into(0, 8, 1, 1, 0),
        });
        expect(state.dealer.board).toMatchObject({ yellow: 3, red: 1 });
        expect(state).toMatchObject({ outcome: "win", chips: 310 });
        expect(state.events.at(-1)).toMatchObject({ reason: "dealer-bust" });
    });

    it("compares ball counts when nobody is decided", () => {
        // dealer 4 + 9 = 13 balls, over its limit; the player has 12, 15 or 13
        const standOn = (ranks: Rank[]) => {
            const random = spread();
            return play(dealt(ranks, random), { type: "stand", random });
        };
        const lose = standOn(["2", "4", "10", "9"]);
        expect(lose).toMatchObject({ outcome: "lose", chips: 290 });
        expect(lose.events.at(-1)).toMatchObject({ reason: "fewer" });
        expect(standOn(["5", "4", "10", "9"])).toMatchObject({
            outcome: "win",
            chips: 310,
        });
        expect(standOn(["3", "4", "10", "9"])).toMatchObject({
            outcome: "push",
            chips: 300,
        });
    });
});

describe("doubling down", () => {
    it("doubles the bet, draws exactly one card, then lets the dealer play", () => {
        const random = spread();
        const opening = dealt(["2", "4", "3", "9", "10"], random, [25]);
        const state = play(opening, { type: "double", random });
        expect(state.bet).toEqual([25, 25]);
        expect(state.player.plays).toHaveLength(3);
        expect(state).toMatchObject({
            phase: "settled",
            outcome: "win",
            chips: 350,
        });
    });

    it("is only allowed right after the opening deal with chips to cover it", () => {
        expect(canDouble(dealt(["2", "4", "3", "5"], MIDDLE, [100, 50]))).toBe(
            true,
        );
        expect(
            canDouble(dealt(["2", "4", "3", "5"], MIDDLE, [100, 50, 5])),
        ).toBe(false);
        const hit = play(dealt(["2", "4", "3", "5", "A"]), {
            type: "hit",
            random: MIDDLE,
        });
        expect(canDouble(hit)).toBe(false);
    });
});

describe("a game of five hands", () => {
    const winHand = (state: State) => {
        const random = spread();
        const opening = play(state, {
            type: "deal",
            deck: deck("5", "4", "10", "9"),
            random,
        });
        return play(opening, { type: "stand", random });
    };

    it("starts the next hand with the same chips on the table", () => {
        const next = play(winHand(bet(newGame(), 50)), { type: "next" });
        expect(next).toMatchObject({
            phase: "betting",
            hand: 2,
            chips: 350,
            bet: [50],
            events: [],
        });
        expect(next.player.board.balls).toBe(0);
    });

    it("goes back to the bet placed before a double", () => {
        const random = spread();
        const opening = dealt(["2", "4", "3", "9", "10"], random, [25]);
        const next = play(play(opening, { type: "double", random }), {
            type: "next",
        });
        expect(next.bet).toEqual([25]);
    });

    it("starts with 300 chips", () => {
        expect(newGame()).toMatchObject({ chips: 300, hand: 1 });
    });

    it("ends after the fifth hand with the chips as the score", () => {
        let state = bet(newGame(), 100);
        for (let hand = 1; hand <= 5; hand++) {
            if (hand > 1) state = play(state, { type: "next" });
            state = winHand(state);
            expect(isOver(state)).toBe(hand === 5);
        }
        expect(result(state)).toEqual({
            score: 100,
            stats: { bankroll: 800, hands: 5 },
        });
        expect(play(state, { type: "next" })).toBe(state);
    });

    it("scores finishing level as 50", () => {
        const state = { ...newGame(), phase: "settled" as const, hand: 5 };
        expect(result(state)).toEqual({
            score: 50,
            stats: { bankroll: 300, hands: 5 },
        });
    });

    // Keeping the 300 chips is 50, doubling them is 100. The shell only accepts integer scores
    // from 0 to 100.
    it.each<[number, number]>([
        [0, 0],
        [2, 0],
        [150, 25],
        [300, 50],
        [372, 62],
        [450, 75],
        [600, 100],
        [2700, 100],
    ])("turns %i chips into a score of %i", (chips, score) => {
        expect(scoreOf(chips)).toBe(score);
    });

    it("ends early when the player can't cover the minimum bet", () => {
        const busted = play(bet(newGame(), 100, 100, 100), {
            type: "deal",
            deck: deck("2", "4", "A", "5"),
            random: into(0),
        });
        expect(busted.chips).toBe(0);
        expect(isOver(busted)).toBe(true);
        expect(result(busted)).toEqual({
            score: 0,
            stats: { bankroll: 0, hands: 1 },
        });
    });
});
