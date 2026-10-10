// The player's character as separate SVG layers, so PlayerAvatar can swap eyes, brows and mouth
// and move the arms and head. The shapes come from the character builder (src/avatarArt.ts);
// the extra expressions (blink, crying, celebrating) are drawn here. No engine imports.
//
// Every layer shares one canvas (VIEW, in the builder's avatar units), so the parts line up
// wherever they are pivoted.

import { AVATAR_EYES, AVATAR_INK, AVATAR_PATHS } from "../src/avatarArt";

// The shell spreads the builder's whole character into the minigame options
// (src/minigames/DestinationGame.tsx), so glasses and hair length arrive with the colours.
export interface AvatarLook {
    hairColor?: string;
    skinColor?: string;
    eyeColor?: string;
    glasses?: string;
    hairLength?: string;
}

export const VIEW = { x: -40, y: -50, w: 260, h: 290 };
export const FRAME = { x: 90, y: 104, r: 96 }; // the portrait ring the character sits in
export const NECK = { x: 90, y: 132 }; // the head tilts around this point
export const SHOULDERS = {
    left: { x: 46, y: 160 },
    right: { x: 134, y: 160 },
};
export const BODY_BASE = { x: 90, y: 196 }; // breathing stretches the body up from here
export const TEAR_SPOTS = [
    { x: 62, y: 100 },
    { x: 118, y: 100 },
];

export const AVATAR_PARTS = [
    "armLeft",
    "armRight",
    "body",
    "head",
    "browsNeutral",
    "browsSad",
    "browsHappy",
    "eyesOpen",
    "eyesClosed",
    "eyesHappy",
    "eyesCry",
    "tears",
    "glasses",
    "mouthSmile",
    "mouthCry",
    "mouthGrin",
    "blush",
] as const;
export type AvatarPart = (typeof AVATAR_PARTS)[number];

export const avatarKey = (part: AvatarPart) => `player-avatar-${part}`;
export const AVATAR_TEXTURE = "player-avatar"; // all parts packed, one frame each

const SHIRT = "#78adff";
const UNDERSHIRT = "#141d2d";
const MOUTH = "#7a2638";
const TONGUE = "#f07c8f";
const TEAR = "#8fd3ff";
const BLUSH = "#ff7f9a";
const DEFAULT_LOOK = {
    hairColor: "#70432E",
    skinColor: "#E4B48F",
    eyeColor: "#4B3024",
};

const isColor = (value: unknown): value is string =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

// Anything unexpected falls back to the defaults: the values end up inside SVG markup.
export function cleanLook(look: AvatarLook) {
    return {
        hairColor: isColor(look.hairColor)
            ? look.hairColor
            : DEFAULT_LOOK.hairColor,
        skinColor: isColor(look.skinColor)
            ? look.skinColor
            : DEFAULT_LOOK.skinColor,
        eyeColor: isColor(look.eyeColor)
            ? look.eyeColor
            : DEFAULT_LOOK.eyeColor,
        glasses: (["glasses", "sunglasses"].includes(look.glasses ?? "")
            ? look.glasses
            : "none") as "none" | "glasses" | "sunglasses",
        longHair: look.hairLength === "long",
    };
}

const svg = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}">${body}</svg>`;

const path = (d: string, attrs: string) => `<path d="${d}" ${attrs}/>`;
const outline = (fill: string, width = 3) =>
    `fill="${fill}" stroke="${AVATAR_INK}" stroke-width="${width}" stroke-linejoin="round"`;
const line = (width = 3, color = AVATAR_INK) =>
    `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;

// A raised arm from the shoulder to a fist; drawn behind the body.
function arm(from: { x: number; y: number }, dx: number, skin: string) {
    const hand = { x: from.x + dx, y: from.y - 84 };
    const d = `M${from.x} ${from.y}L${hand.x} ${hand.y + 6}`;
    return (
        path(d, line(27)) +
        path(d, line(21, SHIRT)) +
        `<circle cx="${hand.x}" cy="${hand.y}" r="12" ${outline(skin)}/>` +
        path(`M${hand.x - 6} ${hand.y - 3}h12`, line(2))
    );
}

// One SVG document per layer; `glasses` is null when the character wears none.
export function avatarLayers(
    look: AvatarLook,
): Record<AvatarPart, string | null> {
    const l = cleanLook(look);
    const [left, right] = AVATAR_EYES;
    const lens = l.glasses === "sunglasses" ? AVATAR_INK : "none";

    return {
        armLeft: svg(arm(SHOULDERS.left, -30, l.skinColor)),
        armRight: svg(arm(SHOULDERS.right, 30, l.skinColor)),
        // Clipped by the ring below its centre line, so the shoulders end inside the portrait.
        body: svg(
            `<clipPath id="frame"><circle cx="${FRAME.x}" cy="${FRAME.y}" r="${FRAME.r - 4}"/>` +
                `<rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${FRAME.y - VIEW.y}"/></clipPath>` +
                `<g clip-path="url(#frame)">` +
                path(AVATAR_PATHS.body, `fill="${SHIRT}"`) +
                path(AVATAR_PATHS.collar, `fill="${UNDERSHIRT}"`) +
                path(AVATAR_PATHS.neck, outline(l.skinColor)) +
                path(
                    AVATAR_PATHS.bodyLines,
                    `stroke="${AVATAR_INK}" stroke-opacity=".35" stroke-width="3"`,
                ) +
                `</g>`,
        ),
        head: svg(
            path(AVATAR_PATHS.ears, outline(l.skinColor)) +
                (l.longHair
                    ? path(AVATAR_PATHS.longHair, outline(l.hairColor))
                    : "") +
                path(AVATAR_PATHS.face, outline(l.skinColor)) +
                path(AVATAR_PATHS.hair, outline(l.hairColor)) +
                path(AVATAR_PATHS.nose, line(2.5)),
        ),
        browsNeutral: svg(path(AVATAR_PATHS.brows, line())),
        browsSad: svg(path("M60 80 76 73M104 73l16 7", line(3.5))), // inner ends up
        browsHappy: svg(path("M60 73q8-8 16-3M104 70q8-5 16 3", line(3.5))),
        eyesOpen: svg(
            AVATAR_EYES.map(
                (eye) =>
                    `<ellipse cx="${eye.white.x}" cy="${eye.white.y}" rx="8" ry="9" fill="#FFFFFF"/>` +
                    `<circle cx="${eye.iris.x}" cy="${eye.iris.y}" r="5" fill="${l.eyeColor}"/>` +
                    `<circle cx="${eye.pupil.x}" cy="${eye.pupil.y}" r="2" fill="${AVATAR_INK}"/>`,
            ).join(""),
        ),
        eyesClosed: svg(
            path(
                `M${left.white.x - 8} 91q8 5 16 0M${right.white.x - 8} 91q8 5 16 0`,
                line(),
            ),
        ),
        eyesHappy: svg(
            path(
                `M${left.white.x - 8} 94q8-11 16 0M${right.white.x - 8} 94q8-11 16 0`,
                line(3.5),
            ),
        ),
        eyesCry: svg(path("M63 84l13 6-13 6M117 84l-13 6 13 6", line(3.5))), // > <
        tears: svg(
            path("M63 99c-3 10-3 21 0 33M117 99c3 10 3 21 0 33", line(5, TEAR)),
        ),
        glasses:
            l.glasses === "none"
                ? null
                : svg(
                      `<g fill="${lens}" fill-opacity=".88" stroke="${AVATAR_INK}" stroke-width="3" stroke-linecap="round">` +
                          AVATAR_EYES.map(
                              (eye) =>
                                  `<circle cx="${eye.white.x}" cy="${eye.white.y}" r="13"/>`,
                          ).join("") +
                          path(AVATAR_PATHS.glassesBridge, `fill="none"`) +
                          `</g>`,
                  ),
        mouthSmile: svg(path(AVATAR_PATHS.smile, line(2.5))),
        mouthCry: svg(
            path("M77 129c0-16 26-16 26 0-6-5-20-5-26 0Z", outline(MOUTH, 2.5)),
        ),
        mouthGrin: svg(
            path(
                "M73 112h34c0 14-8 22-17 22s-17-8-17-22Z",
                outline(MOUTH, 2.5),
            ) +
                path("M75 113.5h30v4c-10 3-20 3-30 0Z", `fill="#FFFFFF"`) +
                path(
                    "M82 129c4-5 12-5 16 0-4 3-12 3-16 0Z",
                    `fill="${TONGUE}"`,
                ),
        ),
        blush: svg(
            `<ellipse cx="58" cy="107" rx="8" ry="4.5" fill="${BLUSH}" fill-opacity=".6"/>` +
                `<ellipse cx="122" cy="107" rx="8" ry="4.5" fill="${BLUSH}" fill-opacity=".6"/>`,
        ),
    };
}

// The point `p` of the shared canvas as a texture origin (0–1).
export const originOf = (p: { x: number; y: number }) => ({
    x: (p.x - VIEW.x) / VIEW.w,
    y: (p.y - VIEW.y) / VIEW.h,
});
