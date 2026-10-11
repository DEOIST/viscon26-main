import { describe, expect, it } from "vitest";
import { handColors } from "./handColors";

const channels = (color: number) => [
    (color >> 16) & 0xff,
    (color >> 8) & 0xff,
    color & 0xff,
];
const brightness = (color: number) =>
    channels(color).reduce((sum, value) => sum + value, 0);

describe("handColors", () => {
    it("uses the avatar's skin colour for the hand", () => {
        expect(handColors("#8D5524").skin).toBe(0x8d5524);
        expect(handColors("#f1c27d").skin).toBe(0xf1c27d);
    });

    it("keeps the original hand's shades for the default skin", () => {
        const colors = handColors(null);
        const close = (actual: number, expected: number) =>
            channels(actual).forEach((value, index) =>
                expect(
                    Math.abs(value - channels(expected)[index]),
                ).toBeLessThanOrEqual(12),
            );
        close(colors.outline, 0x714c40);
        close(colors.nail, 0xffdfca);
        close(colors.crease, 0xc78d71);
    });

    it("shades the hand from the skin: lighter nails, a darker crease", () => {
        for (const skin of ["#FFDBAC", "#E0AC69", "#8D5524", "#3B2219"]) {
            const colors = handColors(skin);
            expect(brightness(colors.crease)).toBeLessThan(
                brightness(colors.skin),
            );
            expect(brightness(colors.nail)).toBeGreaterThan(
                brightness(colors.skin),
            );
        }
    });

    it("outlines light skin darker and very dark skin with a light rim", () => {
        for (const skin of ["#FFDBAC", "#E0AC69", "#8D5524"]) {
            const colors = handColors(skin);
            expect(brightness(colors.outline)).toBeLessThan(
                brightness(colors.skin),
            );
        }
        // On the near-black editor (#0c111b) a darker outline would vanish
        // The builder's darkest swatch, "Deep brown", and a darker photo-measured tone
        for (const skin of ["#624130", "#3B2219"]) {
            const dark = handColors(skin);
            expect(brightness(dark.outline)).toBeGreaterThan(
                brightness(dark.skin),
            );
        }
    });

    it("falls back to the default hand for anything that isn't a colour", () => {
        for (const bad of [undefined, "", "red", "#12345", "#zzzzzz", "url(x)"])
            expect(handColors(bad).skin).toBe(0xeebc96);
    });
});
