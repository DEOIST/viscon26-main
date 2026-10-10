// Tunables for Galton Blackjack (docs/GAME_DESIGN.md). The curve, DEALER_STANDS_AT and
// BLACKJACK_YELLOWS were searched together by simulation for odds close to classic blackjack:
// change one and the house edge moves, so re-run a simulation through rules.ts afterwards.

export const START_CHIPS = 1000; // the semester stipend
export const HANDS = 10;
export const MIN_BET = 10;
export const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 500, 1000];
export const DEALER_STANDS_AT = 10; // balls
export const BLACKJACK_YELLOWS = 3;
export const BLACKJACK_PAYOUT = 1.5; // 3:2

// The curve is the expected stack height of `balls` balls, drawn `spread` times wider than the
// binomial(8, 1/2) the balls really follow. The wider spread gives the outer columns room, so
// busting depends mostly on how many balls you draw rather than on two unlucky balls at the edge.
export const CURVE = { balls: 26, spread: 1.2 };

// The contract's 0-100 score: finishing with START_CHIPS scores this, twice as many scores 100.
export const SCORE_AT_START_CHIPS = 50;

// Animation timings.
export const BALL_GAP_MS = 110; // between balls leaving one card
export const HOP_MS = 72; // pin to pin
export const FUNNEL_MS = 260;
export const DEALER_LINE_MS = 5000; // how long a dealer line stays on the table
