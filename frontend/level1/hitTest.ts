// Which target a shot hits. Pure, so it is unit-tested without Phaser.

export interface Hittable {
    id: number;
    x: number; // game pixels
    y: number;
    radius: number;
    depth: number; // higher is nearer the player
}

// The nearest target whose disc contains the shot; null for a miss.
export function hitTest(
    shot: { x: number; y: number },
    targets: Hittable[],
): number | null {
    let best: Hittable | null = null;
    for (const target of targets) {
        const isInside =
            Math.hypot(shot.x - target.x, shot.y - target.y) <= target.radius;
        if (isInside && (best === null || target.depth > best.depth))
            best = target;
    }
    return best?.id ?? null;
}
