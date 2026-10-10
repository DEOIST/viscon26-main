import { describe, expect, it } from "vitest";
import { mixColor, moodColor } from "./Backdrop";

describe("mixColor", () => {
    it("blends each channel and clamps the amount", () => {
        expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
        expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
        expect(mixColor(0x000000, 0xff8040, 0.5)).toBe(0x804020);
        expect(mixColor(0x102030, 0xffffff, -1)).toBe(0x102030);
        expect(mixColor(0x102030, 0xffffff, 2)).toBe(0xffffff);
    });
});

describe("moodColor", () => {
    it("starts cold, warms with the streak and turns red in the final seconds", () => {
        const calm = moodColor(0, 0);
        const hot = moodColor(20, 0);
        const red = (color: number) => color >> 16;
        const blue = (color: number) => color & 0xff;

        expect(blue(calm)).toBeGreaterThan(red(calm));
        expect(red(hot)).toBeGreaterThan(red(calm));
        expect(moodColor(20, 0)).toBe(moodColor(8, 0)); // capped
        expect(moodColor(0, 1)).toBe(0xff2a2a);
    });
});
