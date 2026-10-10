// Pure helpers for the AI avatar creator (issue #19). Skin tone is measured here, on the device,
// from the pixels inside the on-screen oval; hair and eye color come from the backend.

export type Preset = { label: string; value: string };

/** Face guide as fractions of the frame; keep in sync with .photo-oval in styles.css */
export const OVAL = { cx: 0.5, cy: 0.45, rx: 0.17, ry: 0.3 };

// Both cheeks and the forehead, relative to the oval: flat skin away from eyes, brows and lips
const SKIN_REGIONS = [
    { x: OVAL.cx - 0.1, y: OVAL.cy + 0.04, w: 0.06, h: 0.07 },
    { x: OVAL.cx + 0.04, y: OVAL.cy + 0.04, w: 0.06, h: 0.07 },
    { x: OVAL.cx - 0.05, y: OVAL.cy - 0.2, w: 0.1, h: 0.05 },
];

/** Perceived lightness (CIE L*, 0–100) of an sRGB color */
export function lightness([r, g, b]: number[]): number {
    const lin = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

export const hexToRgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Photographed skin reads darker than the flat preset swatches (shading, webcam exposure).
 * +6 L* moved 8/11 → 9/11 test portraits onto the right preset without breaking dark skin.
 */
export const SKIN_LIGHTNESS_OFFSET = 6;

/** The preset closest in lightness: hue is unreliable under webcam color casts */
export function nearestByLightness(
    rgb: number[],
    presets: Preset[],
    offset = 0,
): Preset {
    const target = lightness(rgb) + offset;
    return presets.reduce((best, preset) =>
        Math.abs(lightness(hexToRgb(preset.value)) - target) <
        Math.abs(lightness(hexToRgb(best.value)) - target)
            ? preset
            : best,
    );
}

/**
 * Typical skin color inside the oval. Uses the well-lit part (60th–95th brightness percentile):
 * shadows under the cheekbones read too dark and glare too light.
 */
export function sampleSkin(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
): number[] {
    const samples: number[][] = [];
    for (const region of SKIN_REGIONS) {
        const x0 = Math.round(region.x * width);
        const y0 = Math.round(region.y * height);
        const x1 = Math.round((region.x + region.w) * width);
        const y1 = Math.round((region.y + region.h) * height);
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = (y * width + x) * 4;
                samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
            }
        }
    }
    samples.sort((a, b) => lightness(a) - lightness(b));
    const used = samples.slice(
        Math.floor(samples.length * 0.6),
        Math.floor(samples.length * 0.95),
    );
    const median = (channel: number) =>
        used.map((s) => s[channel]).sort((a, b) => a - b)[used.length >> 1];
    return [median(0), median(1), median(2)];
}
