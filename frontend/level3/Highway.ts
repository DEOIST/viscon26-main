// The note highway: four neon lanes in fake perspective, beat lines that keep the rhythm
// readable without music, pooled note sprites, the receptors on the hit line and every
// hit, miss and timing effect that happens there.

import { GameObjects } from "phaser";
import type { Scene } from "phaser";
import { BAR_MS } from "./chart";
import {
    LANE_COLORS,
    LANE_CSS,
    LANE_KEYS,
    LANE_NAMES,
    MISS_GRACE_MS,
    NOTE_LEAD_MS,
    WINDOWS,
} from "./config";
import type { DefenseEngine, Hit } from "./engine";
import {
    CENTER_X,
    FAR,
    HIT_Y,
    LANE_WIDTH,
    depthScale,
    laneX,
    progress,
    screenY,
} from "./layout";
import { COLORS, FONT, NOTE_H, NOTE_W } from "./textures";
import { TEXT } from "../src/misc/text";

const BEAT_MS = BAR_MS / 4;
const TOP_SCALE = 1 / FAR;
const JUDGMENT = TEXT.thesisDefense.judgments;
const JUDGMENT_STYLE: Record<Hit | "miss", { text: string; color: string }> = {
    perfect: { text: JUDGMENT.perfect, color: "#ffffff" },
    great: { text: JUDGMENT.great, color: "#9dff4a" },
    good: { text: JUDGMENT.good, color: "#3ee0ff" },
    miss: { text: JUDGMENT.miss, color: "#ff4f6d" },
};
const TIMING_TICKS = 14;

interface Receptor {
    frame: GameObjects.Rectangle;
    fill: GameObjects.Rectangle;
    beam: GameObjects.Image;
    judgment: GameObjects.Text;
    timing: GameObjects.Text;
    isDown: boolean;
}

export default class Highway {
    private readonly scene: Scene;
    private readonly lanes: GameObjects.Graphics;
    private readonly lines: GameObjects.Graphics;
    private readonly meter: GameObjects.Graphics;
    private readonly pool: GameObjects.Image[] = [];
    private readonly active = new Map<number, GameObjects.Image>();
    private readonly receptors: Receptor[];
    private readonly sparks: GameObjects.Particles.ParticleEmitter;
    private readonly shards: GameObjects.Particles.ParticleEmitter;
    private readonly ticks: { delta: number; at: number }[] = [];
    private theme: number = COLORS.ethBlue;
    private eureka = false;

    constructor(scene: Scene) {
        this.scene = scene;
        this.lanes = scene.add.graphics().setDepth(1);
        this.lines = scene.add.graphics().setDepth(2);
        this.meter = scene.add.graphics().setDepth(30);
        this.receptors = LANE_KEYS.map((key, lane) =>
            this.makeReceptor(key, lane),
        );
        this.sparks = scene.add
            .particles(0, 0, "td-spark", {
                speed: { min: 140, max: 420 },
                angle: { min: 200, max: 340 },
                lifespan: { min: 260, max: 620 },
                scale: { start: 1, end: 0 },
                gravityY: 600,
                blendMode: "ADD",
                emitting: false,
            })
            .setDepth(25);
        this.shards = scene.add
            .particles(0, 0, "td-shard", {
                speed: { min: 260, max: 620 },
                angle: { min: 180, max: 360 },
                lifespan: { min: 400, max: 900 },
                rotate: { min: 0, max: 360 },
                scale: { start: 1.6, end: 0.2 },
                gravityY: 900,
                tint: [COLORS.gold, 0xffffff, 0xffb43c],
                emitting: false,
            })
            .setDepth(26);
        this.drawLanes();
    }

    setTheme(color: number) {
        this.theme = color;
        this.drawLanes();
    }

    setEureka(isActive: boolean) {
        this.eureka = isActive;
        this.drawLanes();
    }

    setPressed(lane: number, isDown: boolean) {
        const receptor = this.receptors[lane];
        if (receptor.isDown === isDown) return;
        receptor.isDown = isDown;
        receptor.fill.setFillStyle(LANE_COLORS[lane], isDown ? 0.55 : 0.12);
        receptor.frame.setScale(isDown ? 0.93 : 1);
        receptor.fill.setScale(isDown ? 0.93 : 1);
        receptor.beam.setAlpha(isDown ? 0.35 : 0);
    }

    releaseAll() {
        for (let lane = 0; lane < 4; lane++) this.setPressed(lane, false);
    }

    hit(lane: number, judgment: Hit, delta: number, gold: boolean) {
        const x = laneX(lane, 1);
        this.sparks.setParticleTint(LANE_COLORS[lane]);
        this.sparks.explode(judgment === "perfect" ? 22 : 12, x, HIT_Y);
        if (gold) this.shards.explode(28, x, HIT_Y);
        const ring = this.scene.add
            .image(x, HIT_Y, "td-glow")
            .setTint(gold ? COLORS.gold : LANE_COLORS[lane])
            .setBlendMode("ADD")
            .setDepth(24)
            .setScale(0.6);
        this.scene.tweens.add({
            targets: ring,
            scale: judgment === "perfect" ? 2.4 : 1.7,
            alpha: 0,
            duration: 320,
            ease: "Cubic.Out",
            onComplete: () => ring.destroy(),
        });
        const timing =
            judgment === "perfect"
                ? ""
                : delta < 0
                  ? TEXT.thesisDefense.timing.early
                  : TEXT.thesisDefense.timing.late;
        this.showJudgment(lane, judgment, timing);
        this.addTick(delta);
    }

    miss(lane: number) {
        this.showJudgment(lane, "miss", "");
        this.flashReceptor(lane, COLORS.red);
    }

    stray(lane: number) {
        this.flashReceptor(lane, COLORS.red);
    }

    clear() {
        for (const image of this.active.values()) this.release(image);
        this.active.clear();
        this.ticks.length = 0;
        this.lines.clear();
        this.meter.clear();
        for (const receptor of this.receptors) {
            receptor.judgment.setAlpha(0);
            receptor.timing.setAlpha(0);
        }
        this.releaseAll();
    }

    // Draws the beat lines, chord links and notes for song time `now`.
    draw(engine: DefenseEngine, now: number, beatOrigin: number) {
        const g = this.lines;
        g.clear();
        const firstBeat = Math.ceil((now - beatOrigin) / BEAT_MS);
        for (let k = firstBeat; ; k++) {
            const time = beatOrigin + k * BEAT_MS;
            if (time > now + NOTE_LEAD_MS) break;
            const scale = depthScale(progress(time, now));
            const isBar = k % 4 === 0;
            const half = 2 * LANE_WIDTH * scale;
            g.lineStyle(
                isBar ? 3 : 1.5,
                0xffffff,
                (isBar ? 0.28 : 0.12) * scale,
            );
            g.lineBetween(
                CENTER_X - half,
                screenY(scale),
                CENTER_X + half,
                screenY(scale),
            );
        }

        const seen = new Set<number>();
        const chords = new Map<
            number,
            {
                from: number;
                to: number;
                y: number;
                scale: number;
                alpha: number;
                count: number;
            }
        >();
        const late = WINDOWS.good + MISS_GRACE_MS;
        for (const note of engine.upcoming(now - late, now + NOTE_LEAD_MS)) {
            seen.add(note.id);
            const p = progress(note.time, now);
            const scale = depthScale(p);
            const x = laneX(note.lane, scale);
            const y = screenY(scale);
            let image = this.active.get(note.id);
            if (!image) {
                image = this.acquire();
                image.setTexture(
                    note.gold ? `td-gold-${note.lane}` : `td-note-${note.lane}`,
                );
                this.active.set(note.id, image);
            }
            const fadeIn = Math.min(1, p / 0.08);
            const fadeOut = p > 1 ? Math.max(0, 1 - (p - 1) * 6) : 1;
            const alpha = fadeIn * fadeOut;
            image
                .setPosition(x, y)
                .setScale(scale * 0.98)
                .setAlpha(alpha)
                .setDepth(3 + scale);
            const chord = chords.get(note.time);
            if (chord) {
                chord.from = Math.min(chord.from, x);
                chord.to = Math.max(chord.to, x);
                chord.count += 1;
            } else
                chords.set(note.time, {
                    from: x,
                    to: x,
                    y,
                    scale,
                    alpha,
                    count: 1,
                });
        }
        // Notes of one chord are linked by a bar, so "press together" reads at a glance.
        for (const chord of chords.values()) {
            if (chord.count < 2) continue;
            g.lineStyle(7 * chord.scale, 0xffffff, 0.5 * chord.alpha);
            g.lineBetween(chord.from, chord.y, chord.to, chord.y);
        }
        for (const [id, image] of this.active)
            if (!seen.has(id)) {
                this.release(image);
                this.active.delete(id);
            }
        this.drawMeter();
    }

    private acquire(): GameObjects.Image {
        const image =
            this.pool.pop() ?? this.scene.add.image(0, 0, "td-note-0");
        return image.setVisible(true);
    }

    private release(image: GameObjects.Image) {
        image.setVisible(false);
        this.pool.push(image);
    }

    private makeReceptor(key: string, lane: number): Receptor {
        const x = laneX(lane, 1);
        const w = NOTE_W * 0.98;
        const h = NOTE_H * 0.92;
        const beam = this.scene.add
            .image(x, HIT_Y, "td-beam")
            .setOrigin(0.5, 1)
            .setDisplaySize(LANE_WIDTH * 0.9, 380)
            .setTint(LANE_COLORS[lane])
            .setBlendMode("ADD")
            .setAlpha(0)
            .setDepth(2);
        const fill = this.scene.add
            .rectangle(x, HIT_Y, w, h, LANE_COLORS[lane], 0.12)
            .setRounded(14)
            .setDepth(10);
        const frame = this.scene.add
            .rectangle(x, HIT_Y, w, h)
            .setRounded(14)
            .setStrokeStyle(4, LANE_COLORS[lane], 1)
            .setDepth(11);
        this.scene.add
            .text(x, HIT_Y + 52, key, {
                fontFamily: FONT,
                fontSize: "30px",
                fontStyle: "900",
                color: LANE_CSS[lane],
            })
            .setOrigin(0.5)
            .setDepth(11);
        this.scene.add
            .text(x, HIT_Y + 78, LANE_NAMES[lane].toUpperCase(), {
                fontFamily: FONT,
                fontSize: "12px",
                fontStyle: "bold",
                color: "#c9d3ff",
            })
            .setOrigin(0.5)
            .setAlpha(0.75)
            .setDepth(11);
        const judgment = this.scene.add
            .text(x, HIT_Y - 74, "", {
                fontFamily: FONT,
                fontSize: "22px",
                fontStyle: "900",
                color: "#ffffff",
                stroke: "#070b1f",
                strokeThickness: 6,
            })
            .setOrigin(0.5)
            .setDepth(28)
            .setAlpha(0);
        const timing = this.scene.add
            .text(x, HIT_Y - 50, "", {
                fontFamily: FONT,
                fontSize: "13px",
                fontStyle: "bold",
                color: "#c9d3ff",
                stroke: "#070b1f",
                strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(28)
            .setAlpha(0);
        return { frame, fill, beam, judgment, timing, isDown: false };
    }

    private showJudgment(lane: number, judgment: Hit | "miss", timing: string) {
        const { judgment: text, timing: tag } = this.receptors[lane];
        const style = JUDGMENT_STYLE[judgment];
        this.scene.tweens.killTweensOf([text, tag]);
        text.setText(style.text)
            .setColor(style.color)
            .setAlpha(1)
            .setScale(1.35);
        text.y = HIT_Y - 74;
        this.scene.tweens.add({
            targets: text,
            scale: 1,
            y: HIT_Y - 86,
            duration: 140,
            ease: "Back.Out",
        });
        this.scene.tweens.add({
            targets: text,
            alpha: 0,
            delay: 380,
            duration: 220,
        });
        tag.setText(timing).setAlpha(timing ? 1 : 0);
        if (timing)
            this.scene.tweens.add({
                targets: tag,
                alpha: 0,
                delay: 380,
                duration: 220,
            });
    }

    private flashReceptor(lane: number, color: number) {
        const { frame } = this.receptors[lane];
        frame.setStrokeStyle(5, color, 1);
        this.scene.time.delayedCall(160, () =>
            frame.setStrokeStyle(4, LANE_COLORS[lane], 1),
        );
    }

    private addTick(delta: number) {
        this.ticks.push({ delta, at: this.scene.time.now });
        if (this.ticks.length > TIMING_TICKS) this.ticks.shift();
    }

    // The timing meter under the receptors: where your last presses landed, early to late.
    private drawMeter() {
        const g = this.meter;
        g.clear();
        const y = 704;
        const half = 150;
        g.fillStyle(0x000000, 0.45);
        g.fillRoundedRect(CENTER_X - half - 8, y - 9, 2 * half + 16, 18, 9);
        const span = (ms: number) => (ms / WINDOWS.good) * half;
        g.fillStyle(0x3ee0ff, 0.25);
        g.fillRect(
            CENTER_X - span(WINDOWS.good),
            y - 3,
            span(WINDOWS.good) * 2,
            6,
        );
        g.fillStyle(0x9dff4a, 0.35);
        g.fillRect(
            CENTER_X - span(WINDOWS.great),
            y - 3,
            span(WINDOWS.great) * 2,
            6,
        );
        g.fillStyle(0xffffff, 0.55);
        g.fillRect(
            CENTER_X - span(WINDOWS.perfect),
            y - 3,
            span(WINDOWS.perfect) * 2,
            6,
        );
        const clock = this.scene.time.now;
        for (const tick of this.ticks) {
            const age = (clock - tick.at) / 2500;
            if (age >= 1) continue;
            g.fillStyle(0xffffff, 1 - age);
            g.fillRect(CENTER_X + span(tick.delta) - 1.5, y - 8, 3, 16);
        }
    }

    private drawLanes() {
        const g = this.lanes;
        g.clear();
        const edge = this.eureka ? COLORS.gold : this.theme;
        const topY = screenY(TOP_SCALE);
        const bottomScale = depthScale(1.12);
        const bottomY = screenY(bottomScale);
        const corner = (lane: number, scale: number) =>
            CENTER_X + (lane - 2) * LANE_WIDTH * scale;
        // The road.
        g.fillStyle(0x050817, 0.86);
        const strip = (from: number, to: number) => {
            g.beginPath();
            g.moveTo(corner(from, TOP_SCALE), topY);
            g.lineTo(corner(to, TOP_SCALE), topY);
            g.lineTo(corner(to, bottomScale), bottomY);
            g.lineTo(corner(from, bottomScale), bottomY);
            g.closePath();
            g.fillPath();
        };
        strip(0, 4);
        // A faint wash of each lane's colour.
        for (let lane = 0; lane < 4; lane++) {
            g.fillStyle(LANE_COLORS[lane], this.eureka ? 0.1 : 0.05);
            strip(lane, lane + 1);
        }
        for (let lane = 1; lane < 4; lane++) {
            g.lineStyle(2, 0xffffff, 0.12);
            g.lineBetween(
                corner(lane, TOP_SCALE),
                topY,
                corner(lane, bottomScale),
                bottomY,
            );
        }
        // Neon rails, drawn twice for a cheap glow that also works in Canvas mode.
        for (const [width, alpha] of [
            [12, 0.18],
            [4, 1],
        ]) {
            g.lineStyle(width, edge, alpha);
            g.lineBetween(
                corner(0, TOP_SCALE),
                topY,
                corner(0, bottomScale),
                bottomY,
            );
            g.lineBetween(
                corner(4, TOP_SCALE),
                topY,
                corner(4, bottomScale),
                bottomY,
            );
        }
        // The hit line.
        g.lineStyle(14, edge, 0.2);
        g.lineBetween(corner(0, 1) - 8, HIT_Y, corner(4, 1) + 8, HIT_Y);
        g.lineStyle(3, 0xffffff, 0.8);
        g.lineBetween(corner(0, 1) - 8, HIT_Y, corner(4, 1) + 8, HIT_Y);
    }
}
