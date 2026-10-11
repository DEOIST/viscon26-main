// Level 3, "Thesis defense": a four-lane rhythm game against the examination committee,
// set as a page of your own thesis in a PDF viewer. engine.ts decides every judgment; this
// scene turns key events into presses (stamped with the key event's own time, so frame rate
// never shifts a judgment), runs the title page → countdown → defense → transcript loop and
// makes the figure, the committee's margin and the viewer react to what happened.

import { GameObjects, Scene } from "phaser";
import { BEAT_ORIGIN_MS, DEFENSE_CHART } from "./chart";
import type { Phase } from "./chart";
import Committee from "./Committee";
import type { Mood } from "./Committee";
import {
    COUNTDOWN_MS,
    LANE_KEYS,
    MULTIPLIER_STEP,
    PERFECT_STREAK_TITLE,
} from "./config";
import { DefenseEngine } from "./engine";
import type { DefenseEvent } from "./engine";
import Figure from "./Figure";
import Hud from "./Hud";
import { HEIGHT, WIDTH } from "./layout";
import { committeeLines } from "./lines";
import type { CommitteeEvent } from "./lines";
import Overlays from "./Overlays";
import ThesisAudio, { hitCue, phaseCue } from "./audio";
import Soundtrack from "./Soundtrack";
import { TEXT, loadFonts, makeTextures } from "./textures";
import { loadBest, saveBest, swissGrade, verdictFor } from "./verdict";
import type { BestRun, BestStorage } from "./verdict";
import { pickLine } from "../src/games/shared/minigame";
import type { MinigameResult } from "../src/games/shared/minigame";
import { fill, TEXT as COPY_TEXT } from "../src/misc/text";

const COPY = COPY_TEXT.thesisDefense;

export interface ThesisSceneArgs {
    playerName: string;
    storage: BestStorage;
    finish(result: MinigameResult): void;
    announce(text: string): void; // for screen readers: the canvas itself says nothing
    toggleFullscreen(): void;
    isFullscreen(): boolean;
}

type Mode =
    | "loading"
    | "title"
    | "countdown"
    | "playing"
    | "paused"
    | "resuming"
    | "ending"
    | "results";

const LANE_CODES = LANE_KEYS.map((key) => `Key${key}`);
const RESUME_MS = 2400;
const QUIP_GAP_MS = 2600; // the committee doesn't talk over itself
const PHASE_CAST: Record<Phase, { lead: number | null; say: CommitteeEvent }> =
    {
        opening: { lead: 0, say: "intro" },
        cross: { lead: 2, say: "streak" },
        meltdown: { lead: 1, say: "meltdown" },
        final: { lead: null, say: "final" },
    };

function isTyping(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
}

export default class ThesisScene extends Scene {
    private readonly args: ThesisSceneArgs;
    private readonly lines: Record<CommitteeEvent, string[]>;
    private engine = new DefenseEngine(DEFENSE_CHART);
    private soundtrack!: Soundtrack;
    private mode: Mode = "loading";
    private startAt = 0; // performance.now() at song time 0
    private pausedAt = 0;
    private resumeAt = 0;
    private phase: Phase = "opening";
    private lastQuip = -Infinity;
    private spoken = "";
    private best: BestRun | null = null;
    private bestContract = 0;
    private attempts = 0;
    private soundCombo = 0;
    private submitted = false;
    private fx: ThesisAudio | null = null;
    private committee!: Committee;
    private figure!: Figure;
    private hud!: Hud;
    private overlays!: Overlays;
    private disposed = false;
    private textResolution = 1;
    private resizeObserver: ResizeObserver | null = null;

    constructor(args: ThesisSceneArgs) {
        super("thesis-defense");
        this.args = args;
        this.lines = committeeLines(args.playerName || COPY.defaultName);
    }

    create() {
        this.events.once("shutdown", () => this.dispose());
        this.events.once("destroy", () => this.dispose());
        // Text must not be drawn before the thesis' own faces have loaded.
        void loadFonts().then(() => {
            if (!this.disposed && this.sys.isActive()) this.build();
        });
    }

    private build() {
        makeTextures(this);
        this.soundtrack = new Soundtrack(
            DEFENSE_CHART,
            this.args.storage,
            undefined,
            undefined,
            false,
        );
        this.fx = new ThesisAudio(() => this.soundtrack.muted);
        this.fx.preload();
        this.hud = new Hud(this, this.args.playerName, {
            onFullscreen: () => this.args.toggleFullscreen(),
            onMute: () => this.hud.setSound(this.soundtrack.toggleMute()),
        });
        this.figure = new Figure(this);
        this.committee = new Committee(this);
        this.overlays = new Overlays(
            this,
            this.args.playerName,
            () => this.start(),
            () => this.retry(),
            () => this.submit(),
        );
        this.best = loadBest(this.args.storage);
        this.hud.setSound(this.soundtrack.muted);
        this.hud.setSync(this.soundtrack.syncMs);
        this.showTitle();
        this.args.announce(COPY.announcements.intro);
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("blur", this.handleBlur);
        document.addEventListener("visibilitychange", this.handleVisibility);
        document.addEventListener("fullscreenchange", this.handleFullscreen);
        window.addEventListener("resize", this.handleResize);
        const parent = this.game.canvas?.parentElement;
        if (parent && typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(this.handleResize);
            this.resizeObserver.observe(parent);
        }
        this.fitScreen();
    }

    // Removes the window listeners and closes audio; safe to call twice.
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.fx?.stop();
        this.soundtrack?.dispose();
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("blur", this.handleBlur);
        document.removeEventListener("visibilitychange", this.handleVisibility);
        document.removeEventListener("fullscreenchange", this.handleFullscreen);
        window.removeEventListener("resize", this.handleResize);
        this.resizeObserver?.disconnect();
    }

    update(time: number, delta: number) {
        if (this.mode === "loading") return;
        const now = performance.now();
        const song = this.songTime(now);
        this.committee.update(time, delta);
        if (this.mode === "countdown") {
            this.beep(this.overlays.updateCountdown(-song));
            if (song >= 0) this.mode = "playing";
        } else if (this.mode === "resuming") {
            this.beep(this.overlays.updateCountdown(this.resumeAt - now));
            if (now >= this.resumeAt) {
                this.startAt += this.resumeAt - this.pausedAt;
                this.soundtrack.play(now - this.startAt);
                // A pause during the countdown resumes into what is left of it.
                this.mode = now - this.startAt < 0 ? "countdown" : "playing";
            }
        } else if (this.mode === "playing" || this.mode === "ending") {
            this.beep(this.overlays.updateCountdown(-song));
            if (this.mode === "playing") this.handle(this.engine.update(song));
        }
        if (this.mode === "title" || this.mode === "results") return;
        this.figure.draw(this.engine, song, BEAT_ORIGIN_MS);
        this.hud.update(
            this.engine.state,
            this.engine.accuracy(),
            song / DEFENSE_CHART.end,
            time,
        );
        this.updateMoods();
    }

    // --- Run lifecycle -----------------------------------------------------------

    private showTitle() {
        this.mode = "title";
        this.figure.setVisible(false);
        this.hud.setPlaying(false);
        this.overlays.showTitle(this.best);
        this.committee.setLead(null);
        this.fx?.play("title", 0.26);
    }

    private start() {
        if (this.mode !== "title" && this.mode !== "results") return;
        void this.soundtrack.unlock();
        // Starting from the title page is the gesture fullscreen needs; the booth wants it.
        if (this.mode === "title" && !this.args.isFullscreen())
            this.args.toggleFullscreen();
        this.overlays.hideTitle();
        this.overlays.hideResults();
        this.engine = new DefenseEngine(DEFENSE_CHART);
        this.figure.setVisible(true);
        this.figure.setEureka(false);
        this.figure.setPhase("opening");
        this.hud.reset();
        this.hud.setPlaying(true);
        this.committee.hideNote();
        this.committee.clearScars();
        this.committee.setLead(null);
        this.phase = "opening";
        this.lastQuip = -Infinity;
        this.soundCombo = 0;
        this.attempts += 1;
        this.startAt = performance.now() + COUNTDOWN_MS;
        this.soundtrack.play(-COUNTDOWN_MS);
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
        this.figure.releaseAll();
        this.overlays.hideCountdown();
        this.overlays.showPause(true);
        this.fx?.play("pause", 0.34);
        this.soundtrack.pause();
    }

    private resume() {
        if (this.mode !== "paused") return;
        this.overlays.showPause(false);
        this.fx?.play("resume", 0.34);
        this.resumeAt = performance.now() + RESUME_MS;
        this.mode = "resuming";
    }

    private end(failed: boolean) {
        this.mode = "ending";
        this.figure.setEureka(false);
        if (failed) {
            this.committee.react("furious", 2500);
            this.say(1, "failed", true);
            this.cameras.main.shake(380, 0.01);
        } else {
            const accuracy = this.engine.accuracy();
            this.committee.react(accuracy >= 80 ? "amazed" : "impressed", 2500);
            this.say(1, "passed", true);
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
        this.hud.setPlaying(false);
        this.figure.setVisible(false);
        this.committee.hideNote();
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
        this.fx?.play(
            failed || grade < 4
                ? "verdictLow"
                : grade >= 5.75
                  ? "verdictTop"
                  : "verdictMid",
            failed || grade < 4 ? 0.36 : 0.42,
        );
        if (saved.isNew)
            this.time.delayedCall(900, () => this.fx?.play("newBest", 0.36));
        this.args.announce(
            fill(COPY.announcements.results, {
                verdict: verdict.title,
                grade: grade.toFixed(2),
                score: state.score,
            }),
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
            this.playEventSound(event);
            this.soundtrack.event(event);
            switch (event.type) {
                case "hit":
                    this.figure.hit(event.note, event.judgment);
                    this.hud.addTick(event.delta);
                    break;
                case "miss":
                    this.figure.miss(event.note);
                    this.committee.scar(event.note.time / DEFENSE_CHART.end);
                    this.committee.react("disappointed", 700, this.leaders());
                    if (Math.random() < 0.4) this.say(this.speaker(), "miss");
                    break;
                case "stray":
                    this.figure.stray(event.lane);
                    if (Math.random() < 0.2) this.say(this.speaker(), "stray");
                    break;
                case "milestone":
                    this.committee.scribble(event.title);
                    this.committee.react("amazed", 1100);
                    this.say(this.speaker(), "streak");
                    break;
                case "phase":
                    this.enterPhase(
                        event.index,
                        event.section.phase,
                        event.section.title,
                        event.section.subtitle,
                    );
                    break;
                case "eureka-ready":
                    this.args.announce(COPY.announcements.eurekaReady);
                    break;
                case "eureka-start":
                    this.figure.setEureka(true);
                    this.committee.react("amazed", 1500);
                    this.committee.scribble(COPY.page.eurekaActive);
                    this.say(this.speaker(), "eureka", true);
                    break;
                case "eureka-end":
                    this.figure.setEureka(false);
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

    private playEventSound(event: DefenseEvent) {
        switch (event.type) {
            case "hit": {
                this.soundCombo = this.engine.state.combo;
                this.fx?.play(hitCue(event.judgment), 0.15);
                if (event.note.gold) this.fx?.play("gold", 0.28);
                if (
                    this.soundCombo >= MULTIPLIER_STEP &&
                    this.soundCombo <= MULTIPLIER_STEP * 3 &&
                    this.soundCombo % MULTIPLIER_STEP === 0
                )
                    this.fx?.play("multiplier", 0.22);
                return;
            }
            case "miss":
                if (this.soundCombo >= MULTIPLIER_STEP)
                    this.fx?.play("comboBreak", 0.28);
                this.soundCombo = 0;
                this.fx?.play("miss", 0.5);
                return;
            case "stray":
                if (this.soundCombo >= MULTIPLIER_STEP)
                    this.fx?.play("comboBreak", 0.24);
                this.soundCombo = 0;
                this.fx?.play("stray", 0.85);
                return;
            case "milestone": {
                if (event.title === PERFECT_STREAK_TITLE) {
                    this.fx?.play("perfectStreak", 0.4);
                    return;
                }
                const combo = this.engine.state.combo;
                this.fx?.play(
                    combo >= 100
                        ? "milestone3"
                        : combo >= 50
                          ? "milestone2"
                          : "milestone1",
                    combo >= 100 ? 0.48 : 0.38,
                );
                return;
            }
            case "phase":
                this.fx?.play(phaseCue(event.section.phase), 0.42);
                return;
            case "eureka-ready":
                this.fx?.play("eurekaReady", 0.36);
                return;
            case "eureka-start":
                this.fx?.play("eurekaStart", 0.48);
                return;
            case "eureka-end":
                this.fx?.play("eurekaEnd", 0.3);
                return;
            case "failed":
                this.fx?.play("failed", 0.52);
                return;
            case "complete":
                this.fx?.play(
                    this.engine.accuracy() >= 80 ? "completeBig" : "complete",
                    this.engine.accuracy() >= 80 ? 0.54 : 0.42,
                );
                return;
        }
    }

    private enterPhase(
        index: number,
        phase: Phase,
        title: string,
        subtitle: string,
    ) {
        this.phase = phase;
        const cast = PHASE_CAST[phase];
        this.figure.setPhase(phase);
        this.hud.setSection(index, toTitleCase(title), subtitle);
        this.hud.setNowPlaying(this.soundtrack.nowPlaying(phase));
        this.committee.setLead(cast.lead);
        this.say(cast.lead ?? 1, cast.say, true);
        this.args.announce(`${title}. ${subtitle}`);
        if (phase === "meltdown") {
            this.committee.react("furious", 1600, [1]);
            this.cameras.main.shake(320, 0.008);
        } else if (phase === "final") {
            this.committee.react("furious", 900);
            this.cameras.main.shake(220, 0.005);
        }
    }

    // --- Committee ---------------------------------------------------------------

    private leaders(): number[] {
        const lead = PHASE_CAST[this.phase].lead;
        return lead === null ? [0, 1, 2] : [lead];
    }

    private speaker(): number {
        return PHASE_CAST[this.phase].lead ?? Math.floor(Math.random() * 3);
    }

    private say(who: number, event: CommitteeEvent, force = false) {
        const now = this.time.now;
        if (!force && now - this.lastQuip < QUIP_GAP_MS) return;
        this.lastQuip = now;
        this.spoken = pickLine(this.lines, event, "...", this.spoken);
        this.committee.say(who, this.spoken);
        this.playCommitteeSound(event);
    }

    private playCommitteeSound(event: CommitteeEvent) {
        switch (event) {
            case "passed":
                this.fx?.play("committeeImpressed", 0.16);
                return;
            case "intro":
                return;
            case "streak":
            case "eureka":
                this.fx?.play("committeeAmazed", 0.18);
                return;
            case "miss":
            case "stray":
                this.fx?.play("committeeDisappointed", 0.14);
                return;
            case "meltdown":
            case "final":
            case "failed":
                this.fx?.play("committeeFurious", 0.14);
                return;
        }
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

    private beep(value: string | null) {
        if (!value) return;
        this.soundtrack.countdown(value);
        this.fx?.play(value === "DEFEND!" ? "go" : "countTick", 0.42);
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
        void this.soundtrack.unlock(); // any key counts as the gesture browsers want before audio
        const lane = LANE_CODES.indexOf(event.code);
        if (lane >= 0) {
            event.preventDefault();
            if (event.repeat) return;
            this.figure.setPressed(lane, true);
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
            case "BracketLeft":
            case "BracketRight":
                event.preventDefault();
                this.hud.setSync(
                    this.soundtrack.nudgeSync(
                        event.code === "BracketRight" ? 1 : -1,
                    ),
                );
                return;
            case "KeyM":
                event.preventDefault();
                this.hud.setSound(this.soundtrack.toggleMute());
                return;
            case "KeyF":
                event.preventDefault();
                this.args.toggleFullscreen();
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
        if (lane >= 0) this.figure.setPressed(lane, false);
    };

    private readonly handleBlur = () => {
        this.figure.releaseAll();
        this.pause();
    };

    private readonly handleVisibility = () => {
        if (document.hidden) this.handleBlur();
    };

    // Entering or leaving fullscreen resizes the parent; Phaser refits the canvas to it.
    private readonly handleFullscreen = () => {
        this.fitScreen();
        if (!this.args.isFullscreen()) this.pause();
    };

    private readonly handleResize = () => this.fitScreen();

    // Renders at the screen's own resolution: the backing canvas gets the device pixels the
    // game is shown at and the camera zooms the 1280 x 720 layout into it, so type and pen
    // lines stay sharp instead of being stretched up from 1280 pixels. Fullscreen also grows
    // the layout to the screen's shape (never below 1280 x 720); every background is drawn
    // with bleed, so the extra room shows more viewer and paper instead of letterbox bands.
    private fitScreen() {
        const box = this.game.canvas?.parentElement?.getBoundingClientRect();
        const hasBox = Boolean(box && box.width > 0 && box.height > 0);
        let width = WIDTH;
        let height = HEIGHT;
        if (this.args.isFullscreen() && box && hasBox) {
            const aspect = box.width / box.height;
            if (aspect < WIDTH / HEIGHT) height = Math.round(WIDTH / aspect);
            else width = Math.round(HEIGHT * aspect);
        }
        const shownWidth =
            box && hasBox
                ? Math.min(box.width, box.height * (width / height))
                : width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const zoom = Math.min(3, Math.max(1, (shownWidth * dpr) / width));
        const pixelsW = Math.round(width * zoom);
        const pixelsH = Math.round(height * zoom);
        this.scale.setGameSize(pixelsW, pixelsH);
        this.cameras.main
            .setSize(pixelsW, pixelsH)
            .setOrigin(0, 0)
            .setZoom(zoom)
            .setScroll(0, 0);
        this.scale.refresh();
        // Text is rasterised at the zoom too, or it would be the one blurry thing left.
        const resolution = Math.min(3, Math.ceil(zoom * 2) / 2);
        if (resolution !== this.textResolution) {
            this.textResolution = resolution;
            TEXT.resolution = resolution;
            const sharpen = (items: GameObjects.GameObject[]) => {
                for (const item of items) {
                    if (item instanceof GameObjects.Text)
                        item.setResolution(resolution);
                    else if (item instanceof GameObjects.Container)
                        sharpen(item.list);
                }
            };
            sharpen(this.children.list);
        }
    }
}

// "CROSS-EXAMINATION" → "Cross-Examination": section headings are set in title case.
function toTitleCase(text: string): string {
    return text
        .toLowerCase()
        .replace(
            /(^|[\s-])(\p{L})/gu,
            (_, sep: string, ch: string) => sep + ch.toUpperCase(),
        );
}
