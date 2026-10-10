// The character's shapes (viewBox 0 0 180 200), shared by the React portrait (components/
// Avatar.tsx) and the games that draw the player themselves (level2/avatar.ts), so a change to
// the art shows up everywhere.

export const AVATAR_INK = "#152238"; // every outline

export const AVATAR_PATHS = {
    body: "M22 200v-28c0-32 30-49 68-49s68 17 68 49v28",
    collar: "m64 145 26 26 26-26-9-12H73Z",
    neck: "M76 121h28v27c-8 10-20 10-28 0Z",
    ears: "M43 72c-19-7-17 27 1 28m93-28c19-7 17 27-1 28",
    // Two locks from the temples onto the shoulders: over the ears, behind the face
    longHair:
        "M46 66c-16 30-18 76-2 112 8 4 20 4 28-2-8-26-10-58-4-86ZM134 66c16 30 18 76 2 112-8 4-20 4-28-2 8-26 10-58 4-86Z",
    face: "M43 62c0-30 94-30 94 0v33c0 30-24 47-47 47S43 125 43 95Z",
    hair: "M42 85C19 29 53 8 86 12c41-12 70 17 54 73l-13-27c-20 4-33-3-45-17-5 17-19 24-35 25Z",
    brows: "m61 77 15-2m28 0 15 2",
    nose: "m88 96-3 10h7",
    smile: "M79 118c7 6 15 6 22 0",
    glassesBridge: "M83 89h14M57 88l-12-3m78 3 12-3",
    bodyLines: "M51 179v21m78-21v21",
};

// Each eye is a white, an iris looking slightly inwards and a pupil.
export const AVATAR_EYES = [
    {
        white: { x: 70, y: 90 },
        iris: { x: 71, y: 91 },
        pupil: { x: 72, y: 90 },
    },
    {
        white: { x: 110, y: 90 },
        iris: { x: 109, y: 91 },
        pupil: { x: 108, y: 90 },
    },
];
