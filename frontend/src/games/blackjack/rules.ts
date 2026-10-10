// Galton Blackjack rules as pure functions. Every player owns a Galton board; each drawn card
// drops one ball per suit symbol through its pins. Balls are green under the board's normal
// curve, yellow where it crosses them and red above it. A red ball busts, enough yellow balls
// make a blackjack, otherwise more balls wins. Ten hands from 1000 chips; the chips left
// decide the score.
//
// All randomness comes in through actions, and every outcome is decided here. The scene only
// animates the `events` of the current hand, in order.

import { COLUMNS, GREEN_SLOTS, PIN_ROWS } from "./board";
import {
    BLACKJACK_PAYOUT,
    BLACKJACK_YELLOWS,
    CHIP_VALUES,
    DEALER_STANDS_AT,
    HANDS,
    MIN_BET,
    SCORE_AT_START_CHIPS,
    START_CHIPS,
} from "./config";
import type { MinigameResult } from "../shared/minigame";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
    | "A"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "10"
    | "J"
    | "Q"
    | "K";
export type Card = { rank: Rank; suit: Suit };
export type Who = "player" | "dealer";
export type BallColor = "green" | "yellow" | "red";

export function slotColor(column: number, slot: number): BallColor {
    const green = GREEN_SLOTS[column];
    return slot < green ? "green" : slot === green ? "yellow" : "red";
}

export function ballsOn(card: Card): number {
    if (card.rank === "A") return 1;
    return ["J", "Q", "K"].includes(card.rank) ? 10 : Number(card.rank);
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
];

export function newDeck(): Card[] {
    return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

// Fisher-Yates; returns a new array.
export function shuffle(
    cards: Card[],
    random: () => number = Math.random,
): Card[] {
    const out = [...cards];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// --- One board -------------------------------------------------------------

export type Ball = {
    path: boolean[]; // one bounce per pin row, true = right
    column: number;
    slot: number; // 0 = resting on the floor
    color: BallColor;
};

export type Board = {
    columns: number[]; // balls per column
    balls: number;
    yellow: number;
    event: "bust" | "blackjack" | null; // decided by the first decisive ball
};

export const emptyBoard = (): Board => ({
    columns: Array(COLUMNS).fill(0),
    balls: 0,
    yellow: 0,
    event: null,
});

function dropBall(
    board: Board,
    random: () => number,
): { board: Board; ball: Ball } {
    const path = Array.from({ length: PIN_ROWS }, () => random() >= 0.5);
    const column = path.filter(Boolean).length;
    const slot = board.columns[column];
    const color = slotColor(column, slot);
    const yellow = board.yellow + (color === "yellow" ? 1 : 0);
    const event =
        board.event ??
        (color === "red"
            ? "bust"
            : color === "yellow" && yellow === BLACKJACK_YELLOWS
              ? "blackjack"
              : null);
    const columns = board.columns.map((n, i) => (i === column ? n + 1 : n));
    return {
        board: { columns, balls: board.balls + 1, yellow, event },
        ball: { path, column, slot, color },
    };
}

export function dropCard(
    board: Board,
    card: Card,
    random: () => number,
): { board: Board; balls: Ball[] } {
    const balls: Ball[] = [];
    for (let i = 0; i < ballsOn(card); i++) {
        const dropped = dropBall(board, random);
        board = dropped.board;
        balls.push(dropped.ball);
    }
    return { board, balls };
}

// --- A game ----------------------------------------------------------------

export type Outcome = "blackjack" | "win" | "push" | "lose";
export type Reason =
    | "bust"
    | "blackjack"
    | "dealer-bust"
    | "dealer-blackjack"
    | "more"
    | "fewer"
    | "equal";

export type GameEvent =
    | { type: "draw"; to: Who; card: Card; balls: Ball[] }
    | { type: "secret"; card: Card } // the dealer's face-down card
    | { type: "reveal"; card: Card; balls: Ball[] }
    | { type: "settle"; outcome: Outcome; reason: Reason; payout: number };

export type Side = { board: Board; plays: { card: Card; balls: Ball[] }[] };

export type State = {
    chips: number;
    hand: number; // 1-based
    bet: number[]; // chip values on the bet pile
    betBeforeDouble: number[] | null;
    phase: "betting" | "player" | "settled";
    player: Side;
    dealer: Side;
    secret: Card | null;
    deck: Card[];
    outcome: Outcome | null;
    events: GameEvent[]; // this hand, in order
};

export type Action =
    | { type: "chip"; value: number }
    | { type: "unchip"; index: number }
    | { type: "deal"; deck: Card[]; random: () => number }
    | { type: "hit"; random: () => number }
    | { type: "stand"; random: () => number }
    | { type: "double"; random: () => number }
    | { type: "next" };

const emptySide = (): Side => ({ board: emptyBoard(), plays: [] });

export function newGame(): State {
    return {
        chips: START_CHIPS,
        hand: 1,
        bet: [],
        betBeforeDouble: null,
        phase: "betting",
        player: emptySide(),
        dealer: emptySide(),
        secret: null,
        deck: [],
        outcome: null,
        events: [],
    };
}

export const betOf = (s: State) => s.bet.reduce((sum, chip) => sum + chip, 0);

export const canDouble = (s: State) =>
    s.phase === "player" &&
    s.player.plays.length === 2 &&
    betOf(s) * 2 <= s.chips;

export const isOver = (s: State) =>
    s.phase === "settled" && (s.hand >= HANDS || s.chips < MIN_BET);

// The contract's score: keeping the stipend is 50, doubling it (or better) is 100, broke is 0.
export function scoreOf(chips: number): number {
    const score = Math.round((SCORE_AT_START_CHIPS * chips) / START_CHIPS);
    return Math.max(0, Math.min(100, score));
}

export const result = (s: State): MinigameResult => ({
    score: scoreOf(s.chips),
    stats: { bankroll: s.chips, hands: s.hand },
});

export function payout(outcome: Outcome, bet: number): number {
    switch (outcome) {
        case "blackjack":
            return Math.floor(bet * BLACKJACK_PAYOUT);
        case "win":
            return bet;
        case "push":
            return 0;
        case "lose":
            return -bet;
    }
}

function drop(
    s: State,
    who: Who,
    card: Card,
    random: () => number,
): { state: State; balls: Ball[] } {
    const side = s[who];
    const { board, balls } = dropCard(side.board, card, random);
    const next = { board, plays: [...side.plays, { card, balls }] };
    return { state: { ...s, [who]: next }, balls };
}

function draw(s: State, who: Who, random: () => number): State {
    const [card, ...deck] = s.deck;
    const { state, balls } = drop({ ...s, deck }, who, card, random);
    return {
        ...state,
        events: [...state.events, { type: "draw", to: who, card, balls }],
    };
}

function settle(s: State, outcome: Outcome, reason: Reason): State {
    const amount = payout(outcome, betOf(s));
    return {
        ...s,
        phase: "settled",
        outcome,
        chips: s.chips + amount,
        events: [
            ...s.events,
            { type: "settle", outcome, reason, payout: amount },
        ],
    };
}

// After every player card: a decided board ends the hand.
function checkPlayer(s: State): State {
    const event = s.player.board.event;
    if (event === "bust") return settle(s, "lose", "bust");
    if (event === "blackjack") return settle(s, "blackjack", "blackjack");
    return s;
}

function dealerPlays(s: State, random: () => number): State {
    const secret = s.secret!;
    const revealed = drop({ ...s, secret: null }, "dealer", secret, random);
    s = {
        ...revealed.state,
        events: [
            ...s.events,
            { type: "reveal", card: secret, balls: revealed.balls },
        ],
    };
    while (
        s.dealer.board.event === null &&
        s.dealer.board.balls < DEALER_STANDS_AT
    )
        s = draw(s, "dealer", random);

    const dealer = s.dealer.board;
    if (dealer.event === "bust") return settle(s, "win", "dealer-bust");
    if (dealer.event === "blackjack")
        return settle(s, "lose", "dealer-blackjack");
    const mine = s.player.board.balls;
    if (mine > dealer.balls) return settle(s, "win", "more");
    return mine < dealer.balls
        ? settle(s, "lose", "fewer")
        : settle(s, "push", "equal");
}

export function play(s: State, action: Action): State {
    switch (action.type) {
        case "chip":
            if (s.phase !== "betting" || !CHIP_VALUES.includes(action.value))
                return s;
            if (betOf(s) + action.value > s.chips) return s;
            return { ...s, bet: [...s.bet, action.value] };

        case "unchip":
            if (s.phase !== "betting") return s;
            return { ...s, bet: s.bet.filter((_, i) => i !== action.index) };

        case "deal": {
            if (s.phase !== "betting" || betOf(s) < MIN_BET) return s;
            let next: State = { ...s, phase: "player", deck: action.deck };
            next = draw(next, "player", action.random);
            next = draw(next, "dealer", action.random);
            next = draw(next, "player", action.random);
            const [secret, ...deck] = next.deck;
            next = {
                ...next,
                secret,
                deck,
                events: [...next.events, { type: "secret", card: secret }],
            };
            return checkPlayer(next);
        }

        case "hit":
            if (s.phase !== "player") return s;
            return checkPlayer(draw(s, "player", action.random));

        case "stand":
            return s.phase === "player" ? dealerPlays(s, action.random) : s;

        case "double": {
            if (!canDouble(s)) return s;
            const doubled = draw(
                { ...s, bet: [...s.bet, ...s.bet], betBeforeDouble: s.bet },
                "player",
                action.random,
            );
            const checked = checkPlayer(doubled);
            return checked.phase === "settled"
                ? checked
                : dealerPlays(checked, action.random);
        }

        case "next": {
            if (s.phase !== "settled" || isOver(s)) return s;
            const bet = s.betBeforeDouble ?? s.bet;
            return {
                ...newGame(),
                chips: s.chips,
                hand: s.hand + 1,
                bet:
                    bet.reduce((sum, chip) => sum + chip, 0) <= s.chips
                        ? bet
                        : [],
            };
        }
    }
}
