import { describe, expect, it } from "vitest";
import { COLORS } from "./config";
import { hexToRgb, nearestByLightness, sampleSkin } from "./photo-avatar";

function frame(width: number, height: number, rgb: number[]) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        pixels.set([...rgb, 255], i * 4);
    }
    return pixels;
}

describe("photo avatar skin measurement", () => {
    it("maps every skin preset back to itself", () => {
        for (const preset of COLORS.skin) {
            expect(
                nearestByLightness(hexToRgb(preset.value), COLORS.skin),
            ).toBe(preset);
        }
    });

    it("brightens photographed skin by the calibration offset", () => {
        // Golden tan as photographed (L* 64) lands on Warm beige (77) once
        // brightened past the halfway point between them
        const tan = hexToRgb("#C89062");
        expect(nearestByLightness(tan, COLORS.skin).label).toBe("Golden tan");
        expect(nearestByLightness(tan, COLORS.skin, 7).label).toBe(
            "Warm beige",
        );
    });

    it("measures a uniform face as its own color", () => {
        expect(sampleSkin(frame(64, 48, [200, 150, 120]), 64, 48)).toEqual([
            200, 150, 120,
        ]);
    });

    it("ignores shadows and glare in the cheek regions", () => {
        const pixels = frame(100, 100, [180, 130, 100]);
        // A dark shadow band and a glare spot across the left cheek region
        for (let y = 49; y < 56; y++) {
            for (let x = 40; x < 46; x++) {
                pixels.set([20, 15, 10, 255], (y * 100 + x) * 4);
            }
        }
        pixels.set([255, 255, 255, 255], (50 * 100 + 60) * 4);
        expect(sampleSkin(pixels, 100, 100)).toEqual([180, 130, 100]);
    });
});
