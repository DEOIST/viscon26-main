// The shooter's backdrop instead of the webcam image: a near-black exam-hall corridor that lives
// with the round. Floor and ceiling grids scroll toward the player, dust streams out of the
// vanishing point and the horizon glows. Every shot sends a shockwave through it and flashes the
// glow; a hit streak warms the colours from cold blue to magenta, and the final seconds pulse red.
// One Graphics object redrawn per frame with plain shapes, so it runs on Canvas too (no shaders,
// no gradients) and adds no sprites to the scene's budget.

import { GAME_HEIGHT, GAME_WIDTH } from "../shared/gameSize";
import { HORIZON_Y } from "./depth";
import type { GameObjects, Scene } from "phaser";

const BLACK = 0x05060b;
const CALM = 0x2f6bff; // grid and glow at rest
const HOT = 0xff3d9a; // a long hit streak
const ALARM = 0xff2a2a; // the final seconds
const STREAK_FOR_HOT = 8;
const ENERGY_HALF_LIFE_MS = 280; // how fast a shot's flash fades
const ROWS_PER_SECOND = 0.35; // floor scroll at rest; shots speed it up
const FLOOR_ROWS = 12;
const LANES = 7; // on each side of the centre
const DUST = 48;
const WAVE_MS = 700;
const MAX_WAVES = 6;
const ALARM_BEATS_PER_SECOND = 1.6;

const HORIZON = HORIZON_Y * GAME_HEIGHT;
const CENTER_X = GAME_WIDTH / 2;
const DUST_REACH = Math.hypot(CENTER_X, GAME_HEIGHT - HORIZON);

export interface Mood {
    streak: number; // hits in a row
    isFinalStretch: boolean; // the last seconds of the round
}

interface Wave {
    x: number;
    y: number;
    color: number;
    strength: number;
    ageMs: number;
}

interface Mote {
    angle: number;
    distance: number; // 0 at the vanishing point, 1 at the screen corners
    speed: number;
}

export default class Backdrop {
    private readonly graphics: GameObjects.Graphics;
    private readonly dust: Mote[];
    private waves: Wave[] = [];
    private energy = 0; // 0..1: kicked by shots, fades by itself
    private flash = CALM; // colour of the latest kick
    private scroll = 0;
    private elapsedMs = 0;

    constructor(scene: Scene) {
        this.graphics = scene.add.graphics().setDepth(-1);
        this.dust = Array.from({ length: DUST }, () => newMote(Math.random()));
    }

    // A shockwave from (x, y) in game pixels and a flash of `color`; strength 0..1.
    pulse(x: number, y: number, color: number, strength: number) {
        this.energy = Math.min(1, this.energy + strength);
        this.flash = color;
        this.waves.push({ x, y, color, strength, ageMs: 0 });
        if (this.waves.length > MAX_WAVES) this.waves.shift();
    }

    update(deltaMs: number, mood: Mood) {
        this.elapsedMs += deltaMs;
        this.energy *= 0.5 ** (deltaMs / ENERGY_HALF_LIFE_MS);
        const speedUp = 1 + 4 * this.energy + (mood.isFinalStretch ? 0.6 : 0);
        this.scroll =
            (this.scroll + (deltaMs / 1000) * ROWS_PER_SECOND * speedUp) % 1;
        const beat = mood.isFinalStretch
            ? (Math.sin(
                  (this.elapsedMs / 1000) *
                      ALARM_BEATS_PER_SECOND *
                      2 *
                      Math.PI,
              ) +
                  1) /
              2
            : 0;
        const tone = mixColor(
            moodColor(
                mood.streak,
                mood.isFinalStretch ? 0.35 + 0.45 * beat : 0,
            ),
            this.flash,
            this.energy,
        );

        const graphics = this.graphics;
        graphics.clear();
        graphics.fillStyle(BLACK, 1);
        graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        graphics.fillStyle(tone, 0.04 + 0.08 * this.energy + 0.04 * beat);
        graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.drawGlow(tone, beat);
        this.drawGrid(tone);
        this.drawDust(deltaMs, tone, speedUp);
        this.drawWaves(deltaMs);
    }

    // Stacked translucent ellipses: brightest where they all overlap, at the vanishing point.
    private drawGlow(tone: number, beat: number) {
        const alpha = 0.05 + 0.07 * this.energy + 0.03 * beat;
        for (let ring = 0; ring < 6; ring += 1) {
            this.graphics.fillStyle(tone, alpha);
            this.graphics.fillEllipse(
                CENTER_X,
                HORIZON,
                GAME_WIDTH * (1.5 - ring * 0.24),
                GAME_HEIGHT * (0.55 - ring * 0.085),
            );
        }
        this.graphics.lineStyle(2, tone, 0.35 + 0.5 * this.energy);
        this.graphics.lineBetween(0, HORIZON, GAME_WIDTH, HORIZON);
    }

    private drawGrid(tone: number) {
        const graphics = this.graphics;
        const glow = 0.25 * this.energy;
        graphics.lineStyle(2, tone, 0.12 + glow);
        for (let lane = -LANES; lane <= LANES; lane += 1)
            graphics.lineBetween(
                CENTER_X + lane * 22,
                HORIZON,
                CENTER_X + lane * 190,
                GAME_HEIGHT,
            );
        // Rows bunch up toward the horizon (perspective) and scroll toward the player.
        for (let row = 0; row < FLOOR_ROWS; row += 1) {
            const near = (row + this.scroll) / FLOOR_ROWS;
            const floorY = HORIZON + (GAME_HEIGHT - HORIZON) * near * near;
            graphics.lineStyle(2, tone, 0.04 + 0.26 * near + glow);
            graphics.lineBetween(0, floorY, GAME_WIDTH, floorY);
            const ceilingY = HORIZON - HORIZON * near * near;
            graphics.lineStyle(1, tone, 0.02 + 0.1 * near + glow / 2);
            graphics.lineBetween(0, ceilingY, GAME_WIDTH, ceilingY);
        }
    }

    private drawDust(deltaMs: number, tone: number, speedUp: number) {
        const graphics = this.graphics;
        for (const mote of this.dust) {
            mote.distance +=
                (deltaMs / 1000) *
                mote.speed *
                speedUp *
                (0.15 + mote.distance);
            if (mote.distance > 1) Object.assign(mote, newMote(0.02));
            const x =
                CENTER_X + Math.cos(mote.angle) * mote.distance * DUST_REACH;
            const y =
                HORIZON +
                Math.sin(mote.angle) * mote.distance * DUST_REACH * 0.7;
            graphics.fillStyle(
                mixColor(tone, 0xffffff, 0.5),
                0.15 + 0.55 * mote.distance,
            );
            graphics.fillCircle(x, y, 0.6 + 2.6 * mote.distance);
        }
    }

    private drawWaves(deltaMs: number) {
        for (const wave of this.waves) wave.ageMs += deltaMs;
        this.waves = this.waves.filter((wave) => wave.ageMs < WAVE_MS);
        for (const wave of this.waves) {
            const progress = wave.ageMs / WAVE_MS;
            const radius = (1 - (1 - progress) ** 3) * 520 * wave.strength + 20;
            this.graphics.lineStyle(
                2 + 6 * (1 - progress),
                wave.color,
                0.7 * wave.strength * (1 - progress),
            );
            this.graphics.strokeCircle(wave.x, wave.y, radius);
        }
    }
}

function newMote(distance: number): Mote {
    return {
        angle: Math.random() * 2 * Math.PI,
        distance,
        speed: 0.12 + Math.random() * 0.25,
    };
}

// The resting colour: cold blue, warming toward magenta with the streak, pulled toward red by
// `alarm` (0..1) in the final seconds.
export function moodColor(streak: number, alarm: number): number {
    const warmth = Math.min(1, Math.max(0, streak) / STREAK_FOR_HOT);
    return mixColor(mixColor(CALM, HOT, warmth), ALARM, alarm);
}

// Linear blend of two 0xRRGGBB colours; t = 0 gives `from`, 1 gives `to`.
export function mixColor(from: number, to: number, t: number): number {
    const amount = Math.min(1, Math.max(0, t));
    let mixed = 0;
    for (const shift of [16, 8, 0]) {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        mixed |= Math.round(a + (b - a) * amount) << shift;
    }
    return mixed;
}
