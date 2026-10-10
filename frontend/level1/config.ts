// Shooter tunables (docs/GAME_DESIGN.md, docs/SHOOTER_CV.md). Tune them after playtests; the
// finger-gun thresholds themselves live in the backend (app/services/gesture.py).

import { TEXT } from "../src/misc/text";

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
// Trigger calibration before the warm-up (camera only; docs/SHOOTER_CV.md → Trigger
// calibration): fingers apart, pinched, apart, pinched, each held this long; then a few test shots. Enter
// skips it, T runs it again during the warm-up.
const STEP_TEXT = TEXT.shooter.pinchCheck.steps;
export const TRIGGER_STEPS: {
    step: "up" | "down";
    ms: number;
    text: string;
}[] = [
    {
        step: "up",
        ms: 2000,
        text: STEP_TEXT.apart,
    },
    {
        step: "down",
        ms: 1500,
        text: STEP_TEXT.pinch,
    },
    {
        step: "up",
        ms: 1500,
        text: STEP_TEXT.open,
    },
    {
        step: "down",
        ms: 1500,
        text: STEP_TEXT.pinchAgain,
    },
];
export const TRIGGER_TEST_SHOTS = 3;
export const TRIGGER_MAX_ATTEMPTS = 2; // then the default trigger, so nobody gets stuck
export const TRIGGER_RETRY_MS = 2500; // how long a failure's reason shows before retrying
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
// Playtests asked for a slower round: approaches (and so the code fuses) and spawn gaps are ~30 %
// longer than the first version's 7 s and 1800→950 ms.
export const APPROACH_SECONDS: Record<TargetKind, number> = {
    question: 9,
    deadline: 9,
    coffee: 6.5,
};

export const SPAWN_SHARES: Record<TargetKind, number> = {
    question: 0.72,
    deadline: 0.28,
    coffee: 0,
}; // sums to 1
export const SPAWN_EVERY_MS_START = 2350;
export const SPAWN_EVERY_MS_END = 1250; // the spawn rate rises over the round
export const TARGET_RADIUS = 80; // hit radius in game pixels at scale 1
export const GRAB_RADIUS_MULTIPLIER = 1.8; // extra reach around objects and practice papers
export const GAMER_TARGET_SCALE = 1.15; // Gamer perk: targets 15 % larger
export const ATHLETE_COOLDOWN_MS = 175; // ASVZ-athlete perk: 250 ms re-arm, 30 % faster

// Camera frames sent to the engine. The finger-gun thresholds were tuned on 640 px frames at
// quality 0.8; 320 px at 0.7 made the aim ~20–40 % shakier and fired false shots on the same
// recordings (docs/SHOOTER_CV.md → Camera).
export const FRAME_WIDTH = 640;
export const JPEG_QUALITY = 0.8;
// The engine answers ~30 times a second; the crosshair glides toward each answer with this time
// constant instead of stepping. Larger = smoother but laggier. Shots use the engine's own point.
export const CROSSHAIR_GLIDE_MS = 40;
export const FALLBACK_FRAME_MS = 33; // camera polling where requestVideoFrameCallback is missing

// Grab-and-throw interaction. A slow release drops the object back into its lane.
export const THROW_MIN_DISTANCE = 100; // game pixels moved since grabbing
export const THROW_MIN_SPEED = 650; // game pixels per second
export const THROW_MOTION_WINDOW_MS = 160;
export const GRAB_TRACKING_GRACE_MS = 350;
export const THROW_FLIGHT_MS = 450;

// Code-bash threats. Legacy target kinds stay internal: question = bug, deadline = code bomb.
export const CODE_LOST_PENALTY = 15;
export const BUG_MISSED_PENALTY = 5;
export const INTERRUPTER_MIN_DELAY_MS = 6500;
export const INTERRUPTER_MAX_DELAY_MS = 11000;
export const INTERRUPTER_STAY_MS = 4500;
export const INTERRUPTER_POINTS = 15;
// A slower swipe saves a code card when the swept hand touches the card anywhere, not only the
// flame tip: in game pixels at scale 1, a circle around the card's centre (the card is 236×130).
export const CODE_SWIPE_RADIUS = 115;
export const FUSE_SWIPE_RADIUS = 30; // around the flame, which can burn beyond the card
// Around an interrupter's body (game pixels), for slower swipes; a fast slap needs no aiming.
export const INTERRUPTER_SWIPE_RADIUS = 110;
