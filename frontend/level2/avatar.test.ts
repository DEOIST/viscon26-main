import { describe, expect, it } from "vitest";
import {
    AVATAR_PARTS,
    VIEW,
    avatarLayers,
    cleanLook,
    originOf,
} from "./avatar";

const LOOK = {
    hairColor: "#B95836",
    skinColor: "#C89062",
    eyeColor: "#385E43",
};

describe("cleanLook", () => {
    it("keeps the builder's colours, glasses and hair length", () => {
        expect(
            cleanLook({ ...LOOK, glasses: "sunglasses", hairLength: "long" }),
        ).toEqual({ ...LOOK, glasses: "sunglasses", longHair: true });
    });

    it("falls back to defaults for anything that could break the markup", () => {
        const look = cleanLook({
            hairColor: '"/><script>',
            skinColor: "red",
            glasses: "monocle",
            hairLength: "very",
        });
        expect(look.hairColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(look.skinColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(look.eyeColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(look.glasses).toBe("none");
        expect(look.longHair).toBe(false);
    });
});

describe("avatarLayers", () => {
    it("draws every part on the shared canvas", () => {
        const layers = avatarLayers({ ...LOOK, glasses: "glasses" });
        expect(Object.keys(layers).sort()).toEqual([...AVATAR_PARTS].sort());
        for (const svg of Object.values(layers)) {
            expect(svg).toMatch(
                new RegExp(
                    `^<svg [^>]*viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}">.*</svg>$`,
                ),
            );
        }
    });

    it("uses the character's colours", () => {
        const layers = avatarLayers(LOOK);
        expect(layers.head).toContain(LOOK.hairColor);
        expect(layers.head).toContain(LOOK.skinColor);
        expect(layers.eyesOpen).toContain(LOOK.eyeColor);
        expect(layers.armLeft).toContain(LOOK.skinColor); // the fists
    });

    it("leaves out glasses and long hair unless the character has them", () => {
        const plain = avatarLayers(LOOK);
        const styled = avatarLayers({
            ...LOOK,
            glasses: "glasses",
            hairLength: "long",
        });
        expect(plain.glasses).toBeNull();
        expect(styled.glasses).toContain("<circle");
        expect(styled.head!.length).toBeGreaterThan(plain.head!.length);
    });
});

describe("originOf", () => {
    it("maps the canvas corners to texture origins", () => {
        expect(originOf({ x: VIEW.x, y: VIEW.y })).toEqual({ x: 0, y: 0 });
        expect(originOf({ x: VIEW.x + VIEW.w, y: VIEW.y + VIEW.h })).toEqual({
            x: 1,
            y: 1,
        });
    });
});
