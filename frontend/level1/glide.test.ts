import { describe, expect, it } from "vitest";
import { glideAim } from "./glide";
import { CROSSHAIR_GLIDE_MS } from "./config";

const target = { x: 0.8, y: 0.2 };

describe("glideAim", () => {
    it("jumps to the first aim and hides with the hand", () => {
        expect(glideAim(null, target, 16)).toEqual(target);
        expect(glideAim(target, null, 16)).toBeNull();
    });

    it("covers about 63 % of the way in one time constant", () => {
        const shown = glideAim({ x: 0, y: 0 }, target, CROSSHAIR_GLIDE_MS)!;
        expect(shown.x).toBeCloseTo(0.8 * (1 - Math.exp(-1)));
        expect(shown.y).toBeCloseTo(0.2 * (1 - Math.exp(-1)));
    });

    it("settles on a steady aim within a few frames", () => {
        let shown = { x: 0, y: 0 };
        for (let frame = 0; frame < 20; frame += 1)
            shown = glideAim(shown, target, 16)!;
        expect(shown.x).toBeCloseTo(target.x, 2);
        expect(shown.y).toBeCloseTo(target.y, 2);
    });
});
