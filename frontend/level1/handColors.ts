// The cartoon hand takes the player's avatar skin colour; its outline, nails and crease are
// shades of it, so every skin tone gets the same look the default hand had. Very dark skin gets
// a light rim instead of a dark outline: a dark one would vanish into the near-black editor.
import { mixColor } from "./Backdrop";

export interface HandColors {
    skin: number;
    outline: number;
    nail: number;
    crease: number;
}

const DEFAULT_SKIN = 0xeebc96;
const DARK = 0x1e0f0a;
const LIGHT = 0xffffff;

// Tuned so the default skin reproduces the hand's original hand-picked shades.
const OUTLINE_DARKEN = 0.62;
const NAIL_LIGHTEN = 0.5;
const CREASE_DARKEN = 0.24;
const RIM_LIGHTEN = 0.45;
// Relative luminance (0–255) below which the outline turns into a light rim.
const DARK_SKIN_LUMINANCE = 80; // the builder's "Deep brown" (#624130) is 71

export function handColors(skinColor: string | null | undefined): HandColors {
    const skin = /^#[0-9a-f]{6}$/i.test(skinColor ?? "")
        ? parseInt(skinColor!.slice(1), 16)
        : DEFAULT_SKIN;
    return {
        skin,
        outline:
            luminance(skin) < DARK_SKIN_LUMINANCE
                ? mixColor(skin, LIGHT, RIM_LIGHTEN)
                : mixColor(skin, DARK, OUTLINE_DARKEN),
        nail: mixColor(skin, LIGHT, NAIL_LIGHTEN),
        crease: mixColor(skin, DARK, CREASE_DARKEN),
    };
}

function luminance(color: number): number {
    const [r, g, b] = [16, 8, 0].map((shift) => (color >> shift) & 0xff);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
