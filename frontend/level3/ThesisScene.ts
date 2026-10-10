// Level 3, "Thesis defense": a four-lane rhythm game against the examination committee,
// set as a page of your own thesis in a PDF viewer. engine.ts decides every judgment; this
// scene turns key events into presses (stamped with the key event's own time, so frame rate
// never shifts a judgment), runs the title page → countdown → defense → transcript loop and
// makes the figure, the committee's margin and the viewer react to what happened.

import { Scene } from "phaser";
import { DEFENSE_CHART } from "./chart";
import type { Phase } from "./chart";
import Committee from "./Committee";
import type { Mood } from "./Committee";
import { COUNTDOWN_MS, LANE_KEYS } from "./config";
import { DefenseEngine } from "./engine";
import type { DefenseEvent } from "./engine";
import Figure from "./Figure";
import Hud from "./Hud";
import { HEIGHT, WIDTH } from "./layout";
import { committeeLines } from "./lines";
import type { CommitteeEvent } from "./lines";
import Overlays from "./Overlays";
import Soundtrack from "./Soundtrack";
import { loadFonts, makeTextures } from "./textures";
import { loadBest, saveBest, swissGrade, verdictFor } from "./verdict";
import type { BestRun, BestStorage } from "./verdict";
import { pickLine } from "../src/games/shared/minigame";
import type { MinigameResult } from "../src/games/shared/minigame";

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
    private submitted = false;
    private committee!: Committee;
    private figure!: Figure;
    private hud!: Hud;
    private overlays!: Overlays;
    private disposed = false;

    constructor(args: ThesisSceneArgs) {
        super("thesis-defense");
        this.args = args;
        this.lines = committeeLines(args.playerName || "Candidate");
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
        this.soundtrack = new Soundtrack(DEFENSE_CHART, this.args.storage);
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
        this.showTitle();
        this.args.announce(
            "Thesis defense. Press D, F, J and K as the references reach the rule. Press Space to begin, F for fullscreen.",
        );
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("blur", this.handleBlur);
        document.addEventListener("visibilitychange", this.handleVisibility);
        document.addEventListener("fullscreenchange", this.handleFullscreen);
        window.addEventListener("resize", this.handleResize);
    }

    // Removes the window listeners and closes audio; safe to call twice.
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.soundtrack?.dispose();
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("blur", this.handleBlur);
        document.removeEventListener("visibilitychange", this.handleVisibility);
        document.removeEventListener("fullscreenchange", this.handleFullscreen);
        window.removeEventListener("resize", this.handleResize);
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
        this.figure.draw(this.engine, song, DEFENSE_CHART.phases[0].time);
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
    }

    private start() {
        if (this.mode !== "title" && this.mode !== "results") return;
        this.soundtrack.unlock();
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
        this.figure.releaseAll();
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
        this.args.announce(
            `${verdict.title}. Grade ${grade.toFixed(2)}. Score ${state.score}. Press R to revise and resubmit, or Enter to submit your thesis.`,
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
                    this.args.announce("Eureka is ready. Press Space.");
                    break;
                case "eureka-start":
                    this.figure.setEureka(true);
                    this.committee.react("amazed", 1500);
                    this.committee.scribble("Eureka! ×2");
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
        if (value) this.soundtrack.countdown(value);
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

    private readonly handleResize = () => {
        if (this.args.isFullscreen()) this.fitScreen();
    };

    // Fullscreen fills the screen edge to edge: the game grows to the screen's shape (never
    // below 1280 x 720) and every background is drawn with bleed, so the extra room shows more
    // viewer and more paper instead of letterbox bands. In the shell it stays 1280 x 720.
    private fitScreen() {
        const parent = this.game.canvas?.parentElement;
        let width = WIDTH;
        let height = HEIGHT;
        if (this.args.isFullscreen() && parent) {
            const box = parent.getBoundingClientRect();
            const aspect = box.width / Math.max(1, box.height);
            if (aspect < WIDTH / HEIGHT) height = Math.round(WIDTH / aspect);
            else width = Math.round(HEIGHT * aspect);
        }
        this.scale.setGameSize(width, height);
        this.cameras.main.setSize(width, height);
        this.scale.refresh();
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
