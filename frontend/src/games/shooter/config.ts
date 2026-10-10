// Shooter tunables (docs/GAME_DESIGN.md, docs/SHOOTER_CV.md). Tune them after playtests; the
// finger-gun thresholds themselves live in the backend (app/services/gesture.py).

export type TargetKind = "question" | "deadline" | "coffee";

export const ROUND_SECONDS = 60;
export const COUNTDOWN_SECONDS = 3;
// The warm-up before the round teaches the gesture (docs/GAME_DESIGN.md): one practice paper at a
// time at the centre, top-left and bottom-right, in game-area coordinates. It also covers the
// engine's start-up. Enter skips it, and it never lasts longer than PRACTICE_MAX_SECONDS.
export const PRACTICE_POINTS = [
    { x: 0.5, y: 0.5 },
    { x: 0.18, y: 0.24 },
    { x: 0.82, y: 0.76 },
];
export const PRACTICE_RADIUS = 105; // game pixels: generous, it's practice
export const PRACTICE_MAX_SECONDS = 25;
export const PAR_POINTS = 420; // a good first-time player scores about 70
export const MISS_PENALTY = 2;
export const STREAK_FOR_BONUS = 3;
export const STREAK_BONUS = 5;
export const COFFEE_BONUS_SECONDS = 3;

export const TARGET_POINTS: Record<TargetKind, number> = {
    question: 10,
    deadline: 25,
    coffee: 0,
};
export const APPROACH_SECONDS: Record<TargetKind, number> = {
    question: 6,
    deadline: 3.5,
    coffee: 5,
};

export const SPAWN_EVERY_MS_START = 1400;
export const SPAWN_EVERY_MS_END = 550; // the spawn rate rises over the round
export const TARGET_RADIUS = 80; // hit radius in game pixels at scale 1
export const GAMER_TARGET_SCALE = 1.15; // Gamer perk: targets 15 % larger
export const ATHLETE_COOLDOWN_MS = 175; // ASVZ-athlete perk: 250 ms re-arm, 30 % faster

export const FRAME_WIDTH = 320; // camera frames sent to the engine
export const JPEG_QUALITY = 0.7;
export const FALLBACK_FRAME_MS = 33; // camera polling where requestVideoFrameCallback is missing
