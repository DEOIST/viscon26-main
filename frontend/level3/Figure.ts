// Figure 3.1 on the thesis page: four highlighter lanes set like a booktabs table. References
// (theorems, equations, figures, citations) slide down to the hit rule; a hit highlights
// them with a marker swipe and a blue tick, a miss gets struck through in red pen. Faint
// ruled lines scroll with the beat, and the hit rule thickens on every beat.

import type { GameObjects, Scene } from "phaser";
import { BAR_MS } from "./chart";
import type { Note, Phase } from "./chart";
import {
    GOLD_INK,
    LANE_COLORS,
    LANE_KEYS,
    LANE_NAMES,
    LANE_TOKENS,
    NOTE_LEAD_MS,
} from "./config";
import type { DefenseEngine, Hit } from "./engine";
import {
    COLUMN,
    FIGURE_TOP,
    HIT_Y,
    LANE_WIDTH,
    PAST_LINE_MS,
    laneX,
    noteY,
    progress,
} from "./layout";
import { COLORS, CSS, hand, penLine, serif } from "./textures";
import { TEXT } from "../src/misc/text";

const COPY = TEXT.thesisDefense;

const BEAT_MS = BAR_MS / 4;
const WORDS: Record<Hit, string> = COPY.judgments;

interface Token {
    root: GameObjects.Container;
    strip: GameObjects.Image;
    label: GameObjects.Text;
}

interface Head {
    swatch: GameObjects.Image;
    letter: GameObjects.Text;
    word: GameObjects.Text;
    isDown: boolean;
}

export function tokenFor(note: Note): string {
    const tokens = LANE_TOKENS[note.lane];
    return tokens[note.id % tokens.length];
}

export default class Figure {
    private readonly scene: Scene;
    private readonly lines: GameObjects.Graphics;
    private readonly marks: GameObjects.Graphics;
    private readonly pool: Token[] = [];
    private readonly active = new Map<number, Token>();
    private readonly heads: Head[];
    private readonly parts: GameObjects.GameObject[] = [];
    private ruleColor: number = COLORS.ink;
    private eureka = false;

    constructor(scene: Scene) {
        this.scene = scene;
        const washes = scene.add.graphics().setDepth(2);
        LANE_COLORS.forEach((color, lane) => {
            // Strong enough to survive a washed-out projector.
            washes.fillStyle(color, 0.16);
            washes.fillRect(
                COLUMN.x + lane * LANE_WIDTH + 2,
                FIGURE_TOP,
                LANE_WIDTH - 4,
                HIT_Y - FIGURE_TOP + 4,
            );
        });
        washes.lineStyle(1, COLORS.ink, 0.22);
        for (let lane = 1; lane < 4; lane++)
            washes.lineBetween(
                COLUMN.x + lane * LANE_WIDTH,
                FIGURE_TOP,
                COLUMN.x + lane * LANE_WIDTH,
                HIT_Y + 26,
            );
        this.lines = scene.add.graphics().setDepth(3);
        this.marks = scene.add.graphics().setDepth(9);
        this.heads = LANE_KEYS.map((key, lane) => this.makeHead(key, lane));
        const caption = scene.add
            .text(
                COLUMN.x,
                HIT_Y + 104,
                COPY.page.figureCaption,
                serif(14, CSS.ink, "italic"),
            )
            .setDepth(4);
        this.parts.push(washes, caption);
    }

    setPhase(phase: Phase) {
        this.ruleColor = phase === "meltdown" ? COLORS.redPen : COLORS.ink;
    }

    setEureka(isActive: boolean) {
        this.eureka = isActive;
    }

    setVisible(isVisible: boolean) {
        for (const part of this.parts)
            (part as GameObjects.Image).setVisible(isVisible);
        for (const head of this.heads) {
            head.letter.setVisible(isVisible);
            head.swatch.setVisible(isVisible && head.isDown);
        }
        this.lines.setVisible(isVisible);
        this.marks.setVisible(isVisible);
        if (!isVisible) this.clear();
    }

    setPressed(lane: number, isDown: boolean) {
        const head = this.heads[lane];
        if (head.isDown === isDown) return;
        head.isDown = isDown;
        head.swatch.setVisible(isDown && head.letter.visible);
        head.letter.setScale(isDown ? 0.92 : 1);
    }

    releaseAll() {
        for (let lane = 0; lane < 4; lane++) this.setPressed(lane, false);
    }

    hit(note: Note, judgment: Hit) {
        const x = laneX(note.lane);
        // The marker swipe: left to right across the reference, then it dries and fades.
        const swipe = this.scene.add
            .image(x - LANE_WIDTH * 0.42, HIT_Y, `td-marker-${note.id % 3}`)
            .setOrigin(0, 0.5)
            .setTint(note.gold ? GOLD_INK : LANE_COLORS[note.lane])
            .setDisplaySize(1, 40)
            .setDepth(5);
        this.scene.tweens.add({
            targets: swipe,
            displayWidth: LANE_WIDTH * 0.84,
            duration: 90,
            ease: "Cubic.Out",
        });
        this.scene.tweens.add({
            targets: swipe,
            alpha: 0,
            delay: 160,
            duration: 360,
            onComplete: () => swipe.destroy(),
        });
        const ghost = this.scene.add
            .text(
                x,
                HIT_Y,
                tokenFor(note),
                serif(21, CSS.ink, note.gold ? "bold" : "normal"),
            )
            .setOrigin(0.5)
            .setDepth(6);
        // The answered reference lifts off the rule as it fades, clear of the next one.
        this.scene.tweens.add({
            targets: ghost,
            alpha: 0,
            y: HIT_Y + 18, // down into the rule, never up into the incoming lane
            delay: 40,
            duration: 240,
            ease: "Cubic.Out",
            onComplete: () => ghost.destroy(),
        });
        this.tick(x + LANE_WIDTH * 0.32, HIT_Y - 14, note.id);
        this.say(note.lane, WORDS[judgment], CSS.bluePen);
    }

    miss(note: Note) {
        const x = laneX(note.lane);
        const ghost = this.scene.add
            .text(x, HIT_Y + 18, tokenFor(note), serif(21, CSS.inkSoft))
            .setOrigin(0.5)
            .setDepth(6);
        const strike = this.scene.add.graphics().setDepth(7);
        strike.lineStyle(3, COLORS.redPen, 0.95);
        penLine(
            strike,
            x - ghost.width / 2 - 6,
            HIT_Y + 20,
            x + ghost.width / 2 + 6,
            HIT_Y + 14,
            1.4,
            note.id,
        );
        this.scene.tweens.add({
            targets: [ghost, strike],
            alpha: 0,
            delay: 380,
            duration: 420,
            onComplete: () => {
                ghost.destroy();
                strike.destroy();
            },
        });
        this.say(note.lane, COPY.judgments.miss, CSS.redPen);
    }

    stray(lane: number) {
        this.say(lane, COPY.judgments.stray, CSS.redPen);
    }

    clear() {
        for (const token of this.active.values()) this.release(token);
        this.active.clear();
        this.lines.clear();
        this.marks.clear();
        for (const head of this.heads) head.word.setAlpha(0);
        this.releaseAll();
    }

    // Ruled lines, chord brackets and the references for song time `now`.
    draw(engine: DefenseEngine, now: number, beatOrigin: number) {
        const g = this.lines;
        g.clear();
        // Ruled paper that scrolls with the beat: the cue a metronome would give.
        const first = Math.ceil((now - beatOrigin) / BEAT_MS);
        for (let k = first; ; k++) {
            const time = beatOrigin + k * BEAT_MS;
            if (time > now + NOTE_LEAD_MS) break;
            const y = noteY(progress(time, now));
            const isBar = ((k % 4) + 4) % 4 === 0;
            g.lineStyle(1, COLORS.ink, isBar ? 0.16 : 0.07);
            g.lineBetween(COLUMN.x, y, COLUMN.x + COLUMN.w, y);
        }
        // \toprule and the hit rule, which swells on every beat.
        const since = (((now - beatOrigin) % BEAT_MS) + BEAT_MS) % BEAT_MS;
        const pulse = Math.max(0, 1 - since / 160);
        g.lineStyle(1.6, COLORS.ink, 1);
        g.lineBetween(COLUMN.x, FIGURE_TOP, COLUMN.x + COLUMN.w, FIGURE_TOP);
        const ruleColor = this.eureka ? 0xd4b800 : this.ruleColor;
        g.lineStyle(2 + pulse * 2.5, ruleColor, 1);
        g.lineBetween(
            COLUMN.x - 6,
            HIT_Y + 26,
            COLUMN.x + COLUMN.w + 6,
            HIT_Y + 26,
        );
        g.lineStyle(1, ruleColor, 0.8);
        g.lineBetween(
            COLUMN.x - 6,
            HIT_Y + 30,
            COLUMN.x + COLUMN.w + 6,
            HIT_Y + 30,
        );
        if (this.eureka) {
            g.fillStyle(COLORS.gold, 0.22);
            g.fillRect(COLUMN.x, HIT_Y - 24, COLUMN.w, 48);
        }

        const seen = new Set<number>();
        const chords = new Map<
            number,
            {
                from: number;
                to: number;
                y: number;
                alpha: number;
                count: number;
            }
        >();
        for (const note of engine.upcoming(
            now - PAST_LINE_MS,
            now + NOTE_LEAD_MS,
        )) {
            seen.add(note.id);
            const p = progress(note.time, now);
            const y = noteY(p);
            let token = this.active.get(note.id);
            if (!token) {
                token = this.acquire(note);
                this.active.set(note.id, token);
            }
            const fadeIn = Math.min(1, p / 0.06);
            const fadeOut = p > 1 ? Math.max(0, 1 - (p - 1) * 8) : 1;
            const alpha = fadeIn * fadeOut;
            token.root.setPosition(laneX(note.lane), y).setAlpha(alpha);
            const chord = chords.get(note.time);
            const half = token.strip.displayWidth / 2;
            if (chord) {
                chord.from = Math.min(chord.from, laneX(note.lane) - half);
                chord.to = Math.max(chord.to, laneX(note.lane) + half);
                chord.count += 1;
            } else
                chords.set(note.time, {
                    from: laneX(note.lane) - half,
                    to: laneX(note.lane) + half,
                    y,
                    alpha,
                    count: 1,
                });
        }
        // A chord is bracketed underneath, the way a proof groups simultaneous claims.
        for (const chord of chords.values()) {
            if (chord.count < 2) continue;
            g.lineStyle(1.5, COLORS.ink, 0.7 * chord.alpha);
            g.lineBetween(chord.from, chord.y + 19, chord.to, chord.y + 19);
            g.lineBetween(chord.from, chord.y + 13, chord.from, chord.y + 19);
            g.lineBetween(chord.to, chord.y + 13, chord.to, chord.y + 19);
        }
        for (const [id, token] of this.active)
            if (!seen.has(id)) {
                this.release(token);
                this.active.delete(id);
            }
    }

    private acquire(note: Note): Token {
        const token = this.pool.pop() ?? this.makeToken();
        token.root.setVisible(true);
        token.label
            .setText(tokenFor(note))
            .setFontStyle(note.gold ? "bold" : "normal");
        token.strip
            .setTexture(`td-marker-${note.id % 3}`)
            .setTint(note.gold ? GOLD_INK : LANE_COLORS[note.lane])
            .setDisplaySize(
                Math.min(LANE_WIDTH - 8, token.label.width + 22),
                36,
            );
        return token;
    }

    private release(token: Token) {
        token.root.setVisible(false);
        this.pool.push(token);
    }

    private makeToken(): Token {
        const strip = this.scene.add.image(0, 0, "td-marker-0");
        const label = this.scene.add
            .text(0, 1, "", serif(21, CSS.ink))
            .setOrigin(0.5);
        const root = this.scene.add.container(0, 0, [strip, label]).setDepth(4);
        return { root: root.setVisible(true), strip, label };
    }

    private makeHead(key: string, lane: number): Head {
        const x = laneX(lane);
        const swatch = this.scene.add
            .image(x, HIT_Y + 56, "td-marker-1")
            .setTint(LANE_COLORS[lane])
            .setDisplaySize(64, 40)
            .setDepth(3)
            .setVisible(false);
        const letter = this.scene.add
            .text(x, HIT_Y + 56, key, serif(34, CSS.ink, "bold"))
            .setOrigin(0.5)
            .setDepth(4);
        const name = this.scene.add
            .text(
                x,
                HIT_Y + 80,
                LANE_NAMES[lane],
                serif(13, CSS.inkSoft, "italic"),
            )
            .setOrigin(0.5)
            .setDepth(4);
        const word = this.scene.add
            .text(x, HIT_Y - 52, "", hand(24, CSS.bluePen, true))
            .setOrigin(0.5)
            .setDepth(10)
            .setAlpha(0);
        this.parts.push(name);
        return { swatch, letter, word, isDown: false };
    }

    private say(lane: number, value: string, color: string) {
        const { word } = this.heads[lane];
        this.scene.tweens.killTweensOf(word);
        word.setText(value)
            .setColor(color)
            .setAlpha(1)
            .setAngle(-4 + lane * 2)
            .setY(HIT_Y - 46);
        this.scene.tweens.add({
            targets: word,
            y: HIT_Y - 58,
            duration: 160,
            ease: "Cubic.Out",
        });
        this.scene.tweens.add({
            targets: word,
            alpha: 0,
            delay: 420,
            duration: 260,
        });
    }

    // A blue ballpoint tick next to a defended reference.
    private tick(x: number, y: number, seed: number) {
        const g = this.scene.add.graphics().setDepth(9);
        g.lineStyle(3, COLORS.bluePen, 1);
        penLine(g, x - 8, y, x - 2, y + 7, 0.5, seed);
        penLine(g, x - 2, y + 7, x + 10, y - 9, 0.6, seed + 1);
        this.scene.tweens.add({
            targets: g,
            alpha: 0,
            delay: 380,
            duration: 380,
            onComplete: () => g.destroy(),
        });
    }
}
