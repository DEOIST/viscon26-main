// Test the actual swept hand path against a target, including movement between camera frames.
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import type { CvSlide } from "./input/cvStream";

export function swipeHits(
    slide: CvSlide,
    x: number,
    y: number,
    radius: number,
): boolean {
    if (slide.outlines?.length) {
        const outlines = slide.outlines.map((outline) =>
            outline.map(([px, py]) => ({
                x: px * GAME_WIDTH,
                y: py * GAME_HEIGHT,
            })),
        );
        for (let index = 0; index < outlines.length; index += 1) {
            // Sweep the full hand between adjacent camera frames, including the palm.
            const hull = convexHull([
                ...outlines[index],
                ...(outlines[index + 1] ?? []),
            ]);
            if (touchesPolygon(hull, x, y, radius + slide.radius * GAME_WIDTH))
                return true;
        }
        return false;
    }
    const points = slide.path.map(([px, py]) => ({
        x: px * GAME_WIDTH,
        y: py * GAME_HEIGHT,
    }));
    const reach = radius + slide.radius * GAME_WIDTH;
    for (let index = 0; index < points.length; index += 1) {
        const a = points[index];
        const b = points[index + 1] ?? a;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = dx * dx + dy * dy;
        const t =
            length === 0
                ? 0
                : Math.min(
                      1,
                      Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / length),
                  );
        if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= reach)
            return true;
    }
    return false;
}

interface Point {
    x: number;
    y: number;
}

function convexHull(points: Point[]): Point[] {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length < 3) return sorted;
    const cross = (a: Point, b: Point, c: Point) =>
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const half = (vertices: Point[]) => {
        const hull: Point[] = [];
        for (const point of vertices) {
            while (
                hull.length >= 2 &&
                cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
            )
                hull.pop();
            hull.push(point);
        }
        hull.pop();
        return hull;
    };
    return [...half(sorted), ...half(sorted.slice().reverse())];
}

function touchesPolygon(
    polygon: Point[],
    x: number,
    y: number,
    reach: number,
): boolean {
    let inside = false;
    for (let index = 0; index < polygon.length; index += 1) {
        const a = polygon[index];
        const b = polygon[(index + 1) % polygon.length];
        if (
            a.y > y !== b.y > y &&
            x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
        )
            inside = !inside;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = dx * dx + dy * dy;
        const t =
            length === 0
                ? 0
                : Math.min(
                      1,
                      Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / length),
                  );
        if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= reach)
            return true;
    }
    return inside;
}
