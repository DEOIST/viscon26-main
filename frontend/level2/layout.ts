// Where things are. Card and board positions are in the artwork's own pixels (every card and
// board image is 500 x 700) and were measured from the sheets. Table positions are in table
// units: the table is 1000 units tall and as wide as the shared 16:9 game canvas allows, and
// the scene's camera zooms it onto that canvas.

import { GAME_HEIGHT, GAME_WIDTH } from "../src/games/shared/createGame";
import type { Rank } from "./rules";

export const HEIGHT = 1000;
export const ZOOM = GAME_HEIGHT / HEIGHT;
export const WIDTH = Math.round(GAME_WIDTH / ZOOM); // 1778
export const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };

// --- Card artwork -------------------------------------------------------------

export const CARD = { w: 500, h: 700 };
export const PIP_SCALE = 0.26; // symbols sheet frames are 300 px
export const CORNER_SUIT_SCALE = 0.105;
export const CORNERS = {
    number: [
        [55, 60],
        [445, 640],
    ],
    suit: [
        [55, 113],
        [445, 587],
    ],
} as const;
export const COURT_PEOPLE: Partial<Record<Rank, string>> = {
    J: "newton",
    Q: "curie",
    K: "einstein",
};

const [L, C, R] = [166, 250, 333];
const [TOP, HIGH, UPPER, MID_HIGH, MID, MID_LOW, LOWER, LOW, BOTTOM] = [
    140, 210, 245, 280, 349.5, 419, 454, 489, 559,
];
const FOUR: [number, number][] = [
    [L, TOP],
    [R, TOP],
    [L, BOTTOM],
    [R, BOTTOM],
];
const SIX: [number, number][] = [...FOUR, [L, MID], [R, MID]];

export const PIPS: Partial<Record<Rank, [number, number][]>> = {
    "2": [
        [C, TOP],
        [C, BOTTOM],
    ],
    "3": [
        [C, TOP],
        [C, MID],
        [C, BOTTOM],
    ],
    "4": FOUR,
    "5": [...FOUR, [C, MID]],
    "6": SIX,
    "7": [...SIX, [C, UPPER]],
    "8": [...SIX, [C, UPPER], [C, LOWER]],
    "9": [
        ...FOUR,
        [L, MID_HIGH],
        [R, MID_HIGH],
        [C, MID],
        [L, MID_LOW],
        [R, MID_LOW],
    ],
    "10": [
        ...FOUR,
        [C, HIGH],
        [L, MID_HIGH],
        [R, MID_HIGH],
        [L, MID_LOW],
        [R, MID_LOW],
        [C, LOW],
    ],
};

// --- The table ----------------------------------------------------------------
//
//   dealer avatar     ~~ gold rules belt ~~      secret   [dealer board]
//   dealer's line                                fan ...   counter
//   counter        deck    bet pile
//   [your board]   fan ...
//                        chips x4   [DEAL]                 your avatar
//                        chips x4                          chips left
//   (while playing, HIT / STAND / DOUBLE take the chips' place)

export const BOARD_SCALE = 0.58;
export const CARD_ON_BOARD = 0.62; // a drawn card covers the board's pins while it dissolves
export const DECK_SCALE = 0.26; // the deck and the dealer's secret card
export const FAN_SCALE = 0.165; // the cards already drawn, fanned out beside a board
export const TRAY_SCALE = 0.48; // chip sheet frames are 200 px
export const PILE_SCALE = 0.42;

export type Point = { x: number; y: number };

export const SEATS = {
    dealer: {
        board: { x: WIDTH - 170, y: 228 },
        avatar: { x: 236, y: 150 },
        fan: { x: WIDTH - 374, y: 330, dx: -40 },
        counter: { x: WIDTH - 170, y: 466 },
    },
    player: {
        board: { x: 190, y: 775 },
        avatar: { x: WIDTH - 236, y: 800 },
        fan: { x: 392, y: 668, dx: 40 },
        counter: { x: 190, y: 510 },
    },
} as const;

// The round portraits: 200 px textures with the gold ring at radius 92, and the glow behind.
export const PORTRAIT = { scale: 0.86, ring: 92, glow: 96 };

export const BELT = { x: CENTER.x - 40, y: -470, radius: 680 }; // an arc curving up at both ends
export const HAND_LABEL = { x: CENTER.x - 40, y: 42 };
export const SPEECH = { x: 60, y: 292, width: 400 }; // the dealer's line, under their seat
export const SECRET = { x: WIDTH - 400, y: 132 };
export const DECK = { x: CENTER.x - 180, y: 505 };
export const BET = { x: CENTER.x + 70, y: 525 };
export const BET_LABEL_DY = 98; // under the pile
export const WINNINGS_DX = 96; // the dealer's matching pile, beside the bet
export const TRAY = { x: CENTER.x, y: 826, dx: 112, dy: 104, perRow: 4 };
export const BUTTON_ROW = { x: CENTER.x, y: 900, dx: 164 };
export const DEAL_BUTTON = { x: CENTER.x + 350, y: 878 };
export const CONTINUE_BUTTON = { x: CENTER.x, y: 628 };

// The how-to-play window, measured from its centre (the table's): a screenshot fitted into
// `shot` on the left, the step's text in a column on the right, the controls along the bottom.
export const TUTORIAL = {
    width: 1500,
    height: 820,
    shot: { x: -370, y: -10, width: 680, height: 600 },
    text: { x: 10, y: -340, width: 690 },
    controls: { y: 345, skipX: -710, backX: 405, nextX: 610 },
};
