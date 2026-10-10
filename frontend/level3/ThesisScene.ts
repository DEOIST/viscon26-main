// Level 3, "Thesis defense": a four-lane rhythm game against the examination committee.
// engine.ts decides every judgment; this scene turns key events into presses (stamped with
// the key event's own time, so frame rate never shifts a judgment), runs the title →
// countdown → defense → verdict loop and makes the committee, the student and the highway
// react to what happened.

import { Scene } from "phaser";
import type { GameObjects } from "phaser";
import { BAR_MS, DEFENSE_CHART } from "./chart";
import type { Phase } from "./chart";
import Committee from "./Committee";
import type { Mood } from "./Committee";
import { COUNTDOWN_MS, LANE_KEYS } from "./config";
import { DefenseEngine } from "./engine";
import type { DefenseEvent } from "./engine";
import Highway from "./Highway";
import Hud from "./Hud";
import { CENTER_X, HEIGHT, WIDTH } from "./layout";
import { committeeLines } from "./lines";
import type { CommitteeEvent } from "./lines";
import Overlays from "./Overlays";
import Soundtrack from "./Soundtrack";
import Student from "./Student";
import { COLORS, makeTextures } from "./textures";
import { loadBest, saveBest, swissGrade, verdictFor } from "./verdict";
import type { BestRun, BestStorage } from "./verdict";
import { pickLine } from "../src/games/shared/minigame";
import type { MinigameResult } from "../src/games/shared/minigame";

export interface ThesisSceneArgs {
    playerName: string;
    hairColor?: string;
    skinColor?: string;
    storage: BestStorage;
    finish(result: MinigameResult): void;
    announce(text: string): void; // for screen readers: the canvas itself says nothing
}

type Mode =
    | "title"
    | "countdown"
    | "playing"
    | "paused"
    | "resuming"
    | "ending"
    | "results";

const LANE_CODES = LANE_KEYS.map((key) => `Key${key}`);

function isTyping(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
}
const BEAT_MS = BAR_MS / 4;
const RESUME_MS = 2400;
const QUIP_GAP_MS = 2600; // the committee doesn't talk over itself
const PHASE_LOOK: Record<
    Phase,
    { color: number; css: string; lead: number | null; say: CommitteeEvent }
> = {
    opening: { color: 0x3e7bff, css: "#3ee0ff", lead: 0, say: "intro" },
    cross: { color: 0x9b5cff, css: "#ff4fd8", lead: 2, say: "streak" },
    meltdown: { color: 0xff2d55, css: "#ff4f6d", lead: 1, say: "meltdown" },
    final: { color: 0xffb43c, css: "#ffd84a", lead: null, say: "final" },
};

export default class ThesisScene extends Scene {
    private readonly args: ThesisSceneArgs;
    private readonly lines: Record<CommitteeEvent, string[]>;
    private engine = new DefenseEngine(DEFENSE_CHART);
    private soundtrack!: Soundtrack;
    private mode: Mode = "title";
    private startAt = 0; // performance.now() at song time 0
    private pausedAt = 0;
    private resumeAt = 0;
    private phase: Phase = "opening";
    private lastQuip = -Infinity;
    private spoken = "";
    private best: BestRun | null = null;
    private bestContract = 0;
    private attempts = 0;
    private submitted = false;
    private committee!: Committee;
    private highway!: Highway;
    private hud!: Hud;
    private student!: Student;
    private overlays!: Overlays;
    private glow!: GameObjects.Image;
    private vignette!: GameObjects.Rectangle;
    private disposed = false;

    constructor(args: ThesisSceneArgs) {
        super("thesis-defense");
        this.args = args;
        this.lines = committeeLines(args.playerName || "Candidate");
    }

    create() {
        makeTextures(this);
        this.add.image(WIDTH / 2, HEIGHT / 2, "td-hall").setDepth(-10);
        this.glow = this.add
            .image(CENTER_X, 420, "td-glow")
            .setDisplaySize(1500, 900)
            .setBlendMode("ADD")
            .setTint(PHASE_LOOK.opening.color)
            .setAlpha(0.22)
            .setDepth(-9);
        this.vignette = this.add
            .rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.red, 0)
            .setDepth(60);
        this.committee = new Committee(this);
        this.highway = new Highway(this);
        this.hud = new Hud(this);
        this.student = new Student(
            this,
            this.args.hairColor,
            this.args.skinColor,
            this.args.playerName,
        );
        this.overlays = new Overlays(
            this,
            () => this.start(),
            () => this.retry(),
            () => this.submit(),
        );
        this.best = loadBest(this.args.storage);
        this.soundtrack = new Soundtrack(DEFENSE_CHART, this.args.storage);
        this.hud.setSound(this.soundtrack.muted);
        this.hud.setVisible(false);
        this.overlays.showTitle(this.best);
        this.committee.setLead(null, PHASE_LOOK.opening.color);
        this.args.announce(
            "Thesis defense. Press D, F, J and K as the questions reach the line. Press Space to begin.",
        );

        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("blur", this.handleBlur);
        document.addEventListener("visibilitychange", this.handleVisibility);
        this.events.once("shutdown", () => this.dispose());
        this.events.once("destroy", () => this.dispose());
    }

    // Removes the window listeners; safe to call twice (shutdown, then destroy).
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.soundtrack?.dispose();
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("blur", this.handleBlur);
        document.removeEventListener("visibilitychange", this.handleVisibility);
    }

    update(time: number, delta: number) {
        const now = performance.now();
        const song = this.songTime(now);
        this.committee.update(time, delta);
        this.student.update(
            time,
            this.engine.state.confidence,
            this.engine.state.status === "failed",
        );
        if (this.mode === "countdown") {
            this.beep(this.overlays.updateCountdown(-song));
            if (song >= 0) this.mode = "playing";
        } else if (this.mode === "resuming") {
            this.beep(this.overlays.updateCountdown(this.resumeAt - now));
            if (now >= this.resumeAt) {
                this.startAt += this.resumeAt - this.pausedAt;
                this.soundtrack.restart(now - this.startAt);
                // A pause during the countdown resumes into what is left of it.
                this.mode = now - this.startAt < 0 ? "countdown" : "playing";
            }
        } else if (this.mode === "playing" || this.mode === "ending") {
            this.beep(this.overlays.updateCountdown(-song));
            if (this.mode === "playing") this.handle(this.engine.update(song));
        }
        if (this.mode === "countdown" || this.mode === "playing")
            this.soundtrack.schedule(song);
        if (this.mode === "title" || this.mode === "results") return;
        this.highway.draw(this.engine, song, DEFENSE_CHART.phases[0].time);
        this.hud.update(
            this.engine.state,
            this.engine.accuracy(),
            Math.min(1, Math.max(0, song / DEFENSE_CHART.end)),
            time,
        );
        this.pulse(song);
        this.updateMoods();
    }

    // --- Run lifecycle -----------------------------------------------------------

    private start() {
        if (this.mode !== "title" && this.mode !== "results") return;
        this.soundtrack.unlock();
        this.overlays.hideTitle();
        this.overlays.hideResults();
        this.engine = new DefenseEngine(DEFENSE_CHART);
        this.highway.clear();
        this.highway.setEureka(false);
        this.hud.reset();
        this.hud.setVisible(true);
        this.committee.hideBubble();
        this.setPhaseLook("opening");
        this.committee.setLead(null, PHASE_LOOK.opening.color);
        this.lastQuip = -Infinity;
        this.attempts += 1;
        this.startAt = performance.now() + COUNTDOWN_MS;
        this.soundtrack.restart(-COUNTDOWN_MS);
        this.hud.setNowPlaying(this.soundtrack.nowPlaying("opening"));
        this.mode = "countdown";
    }

    private retry() {
        if (this.mode === "results" || this.mode === "paused") {
            this.overlays.showPause(false);
            this.mode = "results";
            this.start();
        }
    }

    private pause() {
        if (
            this.mode !== "playing" &&
            this.mode !== "countdown" &&
            this.mode !== "resuming"
        )
            return;
        this.pausedAt =
            this.mode === "resuming" ? this.pausedAt : performance.now();
        this.mode = "paused";
        this.highway.releaseAll();
        this.overlays.hideCountdown();
        this.overlays.showPause(true);
    }

    private resume() {
        if (this.mode !== "paused") return;
        this.overlays.showPause(false);
        this.resumeAt = performance.now() + RESUME_MS;
        this.mode = "resuming";
    }

    private end(failed: boolean) {
        this.mode = "ending";
        this.highway.setEureka(false);
        if (failed) {
            this.committee.react("furious", 2500);
            this.say(1, "failed", true);
            this.cameras.main.shake(400, 0.012);
            this.flashVignette(COLORS.red, 0.45);
        } else {
            const accuracy = this.engine.accuracy();
            this.committee.react(accuracy >= 80 ? "amazed" : "impressed", 2500);
            this.say(1, "passed", true);
            this.cameras.main.flash(300, 255, 216, 74);
            this.student.cheer(2000);
        }
        this.time.delayedCall(failed ? 1400 : 1600, () =>
            this.showResults(failed),
        );
    }

    private showResults(failed: boolean) {
        if (this.mode !== "ending") return;
        this.mode = "results";
        const state = this.engine.state;
        const accuracy = failed
            ? this.engine.contractScore()
            : this.engine.accuracy();
        const saved = saveBest(this.args.storage, {
            score: state.score,
            accuracy,
            maxCombo: state.maxCombo,
        });
        this.best = saved.best;
        this.bestContract = Math.max(
            this.bestContract,
            this.engine.contractScore(),
        );
        const grade = swissGrade(failed, accuracy);
        const verdict = verdictFor(failed, grade);
        this.hud.setVisible(false);
        this.highway.clear();
        // The stamp lands 610 ms in (see Overlays.showResults).
        this.time.delayedCall(610, () => this.soundtrack.stamp());
        this.overlays.showResults({
            verdict,
            failed,
            grade,
            accuracy,
            state,
            best: saved.best,
            isNewBest: saved.isNew,
            submitted: this.submitted,
        });
        this.args.announce(
            `${verdict.title}. Grade ${grade.toFixed(2)}. Score ${state.score}. Press R to defend again or Enter to submit your thesis.`,
        );
    }

    private submit() {
        if (this.mode !== "results" || this.submitted) return;
        this.submitted = true;
        this.overlays.setSubmitted(true);
        const state = this.engine.state;
        this.args.finish({
            score: this.bestContract,
            stats: {
                score: state.score,
                accuracy: this.engine.accuracy(),
                maxCombo: state.maxCombo,
                attempts: this.attempts,
            },
        });
    }

    // --- Engine events -----------------------------------------------------------

    private handle(events: DefenseEvent[]) {
        for (const event of events) {
            this.soundtrack.event(event);
            switch (event.type) {
                case "hit":
                    this.highway.hit(
                        event.note.lane,
                        event.judgment,
                        event.delta,
                        event.note.gold,
                    );
                    if (event.note.gold)
                        this.cameras.main.flash(90, 255, 216, 74, true);
                    break;
                case "miss":
                    this.highway.miss(event.note.lane);
                    this.flashVignette(COLORS.red, 0.16);
                    this.committee.react("disappointed", 700, this.leaders());
                    if (Math.random() < 0.4) this.say(this.speaker(), "miss");
                    break;
                case "stray":
                    this.highway.stray(event.lane);
                    if (Math.random() < 0.2) this.say(this.speaker(), "stray");
                    break;
                case "milestone":
                    this.hud.showMilestone(event.title);
                    this.committee.react("amazed", 1100);
                    this.student.cheer();
                    this.say(this.speaker(), "streak");
                    this.punchCamera();
                    break;
                case "phase":
                    this.enterPhase(
                        event.section.phase,
                        event.section.title,
                        event.section.subtitle,
                    );
                    break;
                case "eureka-ready":
                    this.args.announce("Eureka is ready. Press Space.");
                    break;
                case "eureka-start":
                    this.highway.setEureka(true);
                    this.cameras.main.flash(220, 255, 230, 140);
                    this.committee.react("amazed", 1500);
                    this.say(this.speaker(), "eureka", true);
                    this.hud.showMilestone("EUREKA! ×2");
                    break;
                case "eureka-end":
                    this.highway.setEureka(false);
                    break;
                case "failed":
                    this.end(true);
                    return;
                case "complete":
                    this.end(false);
                    return;
            }
        }
    }

    private enterPhase(phase: Phase, title: string, subtitle: string) {
        this.setPhaseLook(phase);
        const look = PHASE_LOOK[phase];
        this.hud.showPhase(title, subtitle, look.css);
        this.hud.setNowPlaying(this.soundtrack.nowPlaying(phase));
        this.committee.setLead(look.lead, look.color);
        this.say(look.lead ?? 1, look.say, true);
        this.args.announce(`${title}. ${subtitle}`);
        if (phase === "meltdown") {
            this.committee.react("furious", 1600, [1]);
            this.cameras.main.shake(350, 0.01);
            this.flashVignette(COLORS.red, 0.3);
        } else if (phase === "final") {
            this.committee.react("furious", 900);
            this.cameras.main.shake(250, 0.006);
        }
    }

    private setPhaseLook(phase: Phase) {
        this.phase = phase;
        const look = PHASE_LOOK[phase];
        this.highway.setTheme(look.color);
        this.glow.setTint(look.color);
    }

    // --- Committee ---------------------------------------------------------------

    private leaders(): number[] {
        const lead = PHASE_LOOK[this.phase].lead;
        return lead === null ? [0, 1, 2] : [lead];
    }

    private speaker(): number {
        const lead = PHASE_LOOK[this.phase].lead;
        return lead ?? Math.floor(Math.random() * 3);
    }

    private say(who: number, event: CommitteeEvent, force = false) {
        const now = this.time.now;
        if (!force && now - this.lastQuip < QUIP_GAP_MS) return;
        this.lastQuip = now;
        this.spoken = pickLine(this.lines, event, "...", this.spoken);
        this.committee.say(who, this.spoken);
    }

    private updateMoods() {
        const { combo, confidence } = this.engine.state;
        const mood: Mood =
            combo >= 50
                ? "amazed"
                : combo >= 20
                  ? "impressed"
                  : confidence < 35
                    ? "disappointed"
                    : "neutral";
        const moods: Mood[] = [mood, mood, mood];
        if (this.phase === "meltdown" && combo < 50) moods[1] = "furious";
        this.committee.setBaseMoods(moods);
        // The meltdown professor keeps shouting while the attack lasts.
        if (this.phase === "meltdown" && this.mode === "playing")
            this.say(1, "meltdown");
    }

    // --- Visual rhythm -----------------------------------------------------------

    // The hall breathes on every beat, the cue a music track would normally give.
    private pulse(song: number) {
        const since =
            (((song - DEFENSE_CHART.phases[0].time) % BEAT_MS) + BEAT_MS) %
            BEAT_MS;
        const beat = 1 - since / BEAT_MS;
        const base = this.engine.state.eurekaActive ? 0.36 : 0.18;
        this.glow.setAlpha(base + beat * beat * 0.16);
    }

    // A quick zoom pulse. A tween on the camera instead of zoomTo(), whose ease argument
    // throws in Phaser 4.
    private punchCamera() {
        const camera = this.cameras.main;
        this.tweens.killTweensOf(camera);
        camera.setZoom(1);
        this.tweens.add({
            targets: camera,
            zoom: 1.03,
            duration: 90,
            yoyo: true,
            ease: "Quad.Out",
            onComplete: () => camera.setZoom(1),
        });
    }

    private beep(value: string | null) {
        if (value) this.soundtrack.countdown(value);
    }

    private flashVignette(color: number, alpha: number) {
        this.tweens.killTweensOf(this.vignette);
        this.vignette.setFillStyle(color, 1).setAlpha(alpha);
        this.tweens.add({ targets: this.vignette, alpha: 0, duration: 260 });
    }

    // --- Input -------------------------------------------------------------------

    private songTime(now: number): number {
        if (this.mode === "paused" || this.mode === "resuming")
            return this.pausedAt - this.startAt;
        return now - this.startAt;
    }

    // Key events carry the moment the key went down; judging by that instead of the next
    // frame keeps timing exact even when the browser drops frames.
    private eventTime(event: KeyboardEvent): number {
        const now = performance.now();
        const stamp = event.timeStamp;
        return stamp > 0 && Math.abs(now - stamp) < 1000 ? stamp : now;
    }

    private readonly handleKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTyping(event.target)) return; // a shell dialog's text field keeps its keys
        this.soundtrack.unlock(); // any key counts as the gesture browsers want before audio
        const lane = LANE_CODES.indexOf(event.code);
        if (lane >= 0) {
            event.preventDefault();
            if (event.repeat) return;
            this.highway.setPressed(lane, true);
            if (this.mode === "playing")
                this.handle(
                    this.engine.press(
                        lane,
                        this.eventTime(event) - this.startAt,
                    ),
                );
            return;
        }
        switch (event.code) {
            case "Space":
                event.preventDefault();
                if (event.repeat) return;
                if (this.mode === "title") this.start();
                else if (this.mode === "paused") this.resume();
                else if (this.mode === "playing")
                    this.handle(
                        this.engine.activate(
                            this.eventTime(event) - this.startAt,
                        ),
                    );
                return;
            case "KeyM":
                event.preventDefault();
                this.hud.setSound(this.soundtrack.toggleMute());
                return;
            case "Escape":
            case "KeyP":
                if (this.mode === "paused") this.resume();
                else this.pause();
                return;
            case "KeyR":
                if (this.mode === "results" || this.mode === "paused") {
                    event.preventDefault();
                    this.retry();
                }
                return;
            case "Enter":
            case "NumpadEnter":
                if (this.mode === "results") {
                    event.preventDefault();
                    this.submit();
                } else if (this.mode === "title") {
                    event.preventDefault();
                    this.start();
                }
                return;
        }
    };

    private readonly handleKeyUp = (event: KeyboardEvent) => {
        const lane = LANE_CODES.indexOf(event.code);
        if (lane >= 0) this.highway.setPressed(lane, false);
    };

    private readonly handleBlur = () => {
        this.highway.releaseAll();
        this.pause();
    };

    private readonly handleVisibility = () => {
        if (document.hidden) this.handleBlur();
    };
}
