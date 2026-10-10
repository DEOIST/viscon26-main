// The engine's calibration box: the region of the mirrored camera image (x0, y0, x1, y1 in 0..1)
// that maps onto the whole game area. The video is scaled so that this region fills the game
// area, so the box needs the game area's shape in camera pixels, or the webcam image looks
// stretched. The engine can't know the camera's shape; the browser can.

export type Box = [number, number, number, number];

const TOLERANCE = 1e-6;

// Keeps the box's width and vertical centre and derives its height from the camera's aspect
// ratio (width / height), so that the box has the game area's aspect ratio in camera pixels.
export function boxForAspect(
    base: Box,
    cameraAspect: number,
    gameAspect: number,
): Box {
    if (!isPositive(cameraAspect) || !isPositive(gameAspect)) return base;
    const [x0, y0, x1, y1] = base;
    const height = Math.min(1, ((x1 - x0) * cameraAspect) / gameAspect);
    const top = Math.min(Math.max((y0 + y1) / 2 - height / 2, 0), 1 - height);
    return [x0, top, x1, top + height];
}

export function isSameBox(a: Box, b: Box): boolean {
    return a.every((value, index) => Math.abs(value - b[index]) < TOLERANCE);
}

function isPositive(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}
