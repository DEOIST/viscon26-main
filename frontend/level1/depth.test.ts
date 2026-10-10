import { describe, expect, it } from "vitest";
import { HORIZON_Y, project } from "./depth";

describe("project (fake depth)", () => {
    it("puts a far target small, hazy and at the horizon, in the middle", () => {
        const far = project(0.9, 0.85, 1);

        expect(far.y).toBeCloseTo(HORIZON_Y);
        expect(far.x).toBeCloseTo(0.5 + 0.4 * 0.35);
        expect(far.scale).toBeCloseTo(0.3);
        expect(far.alpha).toBeCloseTo(0.45);
    });

    it("puts a near target full size at its own lane and height", () => {
        const near = project(0.9, 0.85, 0);

        expect(near.x).toBeCloseTo(0.9);
        expect(near.y).toBeCloseTo(0.85);
        expect(near.scale).toBeCloseTo(1.25);
        expect(near.alpha).toBeCloseTo(1);
    });

    it("draws nearer targets on top", () => {
        expect(project(0.5, 0.8, 0.2).depth).toBeGreaterThan(
            project(0.5, 0.8, 0.7).depth,
        );
    });

    it("accelerates as the target approaches, like perspective", () => {
        const firstHalf =
            project(0.5, 0.8, 0.5).scale - project(0.5, 0.8, 1).scale;
        const secondHalf =
            project(0.5, 0.8, 0).scale - project(0.5, 0.8, 0.5).scale;

        expect(secondHalf).toBeGreaterThan(firstHalf);
    });

    it("clamps depth outside 0..1", () => {
        expect(project(0.5, 0.8, -3)).toEqual(project(0.5, 0.8, 0));
        expect(project(0.5, 0.8, 7)).toEqual(project(0.5, 0.8, 1));
    });
});
