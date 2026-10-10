// The 9-column Galton board in the artwork's pixels (500 x 700), measured from the board
// sheet, and the normal curve drawn over its columns. Shared by the rules (which slots are
// green, yellow, red) and the scene (where to draw). No engine imports.

import { CURVE } from "./config";

export const PIN_ROWS = 8;
export const COLUMNS = PIN_ROWS + 1;

export const BOARD = {
    funnelTop: { x: 249.8, y: 70 },
    pinX: 249.8, // centre pin, also the centre column
    pinDx: 40.2, // = column width
    pinY: 149,
    pinDy: 26.98,
    pinRadius: 8,
    ballRadius: 15, // the 9-column ball sprites are 30 px across
    floor: 619,
    barTop: 355, // the bars between the columns start just under the last pin row
    slotPitch: 27, // balls overlap slightly, as in the designer's mock-up
    left: 62, // outer walls
    right: 437,
};

export const pinAt = (row: number, index: number) => ({
    x: BOARD.pinX + (index - row / 2) * BOARD.pinDx,
    y: BOARD.pinY + row * BOARD.pinDy,
});
export const columnX = (column: number) =>
    BOARD.pinX + (column - 4) * BOARD.pinDx;

// Where ball `slot` rests in a column that holds `count` balls. Nine balls fit under the top
// of the bars; a taller stack (only on a bust board, when one card sends many balls down the
// same column) is packed tighter instead, so it never rises above the bars into the pins.
export function restY(slot: number, count: number): number {
    const room = BOARD.floor - BOARD.barTop - 2 * BOARD.ballRadius;
    const pitch = Math.min(BOARD.slotPitch, room / Math.max(1, count - 1));
    return BOARD.floor - BOARD.ballRadius - slot * pitch;
}

const SIGMA = Math.SQRT2 * BOARD.pinDx * CURVE.spread;

// Height of the curve above the floor, `dx` px from the centre column.
export function curveHeight(dx: number): number {
    const density =
        Math.exp(-(dx * dx) / (2 * SIGMA * SIGMA)) /
        (SIGMA * Math.sqrt(2 * Math.PI));
    return CURVE.balls * BOARD.slotPitch * BOARD.pinDx * density;
}

// Balls that fit fully under the curve, per column. The next ball up is the one the curve
// crosses on the column's centre line (yellow); any higher is red.
export const GREEN_SLOTS = Array.from({ length: COLUMNS }, (_, column) => {
    const height = curveHeight(columnX(column) - BOARD.pinX);
    const diameter = 2 * BOARD.ballRadius;
    return height < diameter
        ? 0
        : Math.floor((height - diameter) / BOARD.slotPitch) + 1;
});
