// Fake depth (docs/SHOOTER_CV.md): a target "flies" from far away (z = 1: small, hazy, at the
// horizon in the middle) to the player (z = 0: full size at its own lane). No 3D engine: scale,
// position, draw order and haze do the job. Coordinates are fractions of the game area.

export const HORIZON_Y = 0.3;

export interface Projection {
    x: number;
    y: number;
    scale: number;
    alpha: number;
    depth: number; // draw order: higher is nearer
}

export function project(laneX: number, nearY: number, z: number): Projection {
    const closeness = 1 - Math.min(1, Math.max(0, z));
    const eased = closeness * closeness; // slow far away, fast up close, like perspective
    return {
        x: 0.5 + (laneX - 0.5) * (0.35 + 0.65 * eased),
        y: HORIZON_Y + (nearY - HORIZON_Y) * eased,
        scale: 0.3 + 0.95 * eased,
        alpha: 0.45 + 0.55 * eased,
        depth: Math.round(eased * 1000),
    };
}
