// The first-day cinematic between "Begin Year 1" and the degree workspace: the avatar slides to
// centre stage and beams about getting into ETH, then the semester hits it, Minecraft style,
// until Emotional Damage lands the last blow and the avatar takes its seat in the sidebar.
// Skipping (or reduced motion) only shortens the show: onEnter, which saves, always runs.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PresentationTimeline } from "../misc/motion";
import type { Character } from "../types";
import { Avatar } from "./Avatar";
import type { AvatarExpression } from "./Avatar";
import PixelHeart from "./PixelHeart";
import styles from "./YearOneIntro.module.css";

// Where each phrase winds up before it strikes, in vw / vh from the avatar.
const ATTACKS = [
    { text: "Lectures", x: -34, y: -12, damage: 2 },
    { text: "Practice Classes", x: 32, y: -20, damage: 2 },
    { text: "Lernphase", x: -28, y: 22, damage: 2 },
];
const FINALE = { text: "Emotional Damage", damage: 3 };
const HEARTS = 10; // in half hearts; the finale leaves one

const ENTER_MS = 900; // the slide to centre stage
const HAPPY_MS = 2000;
const ATTACK_MS = 1300; // keep in sync with the `strike` keyframes
const ATTACK_HIT_MS = 975; // 75 % of ATTACK_MS
const ATTACK_GAP_MS = 250;
const FINALE_MS = 2200; // keep in sync with the `slam` keyframes
const FINALE_HIT_MS = 1760; // 80 % of FINALE_MS
const AFTERMATH_MS = 1100;
const EXIT_MS = 800;
const BLINK_MS = 140;

type Step = "enter" | "happy" | "attack" | "finale" | "exit";
type Box = { x: number; y: number; width: number; height: number };

// The avatar's 180 x 200 drawing as an <svg> lays it out: fitted and centred in its box.
function drawing(box: Box): Box {
    const scale = Math.min(box.width / 180, box.height / 200);
    const width = 180 * scale;
    const height = 200 * scale;
    return {
        x: box.x + (box.width - width) / 2,
        y: box.y + (box.height - height) / 2,
        width,
        height,
    };
}

// The transform that lays the centre-stage avatar over another avatar on the page.
function cover(stage: HTMLElement, target: Box): string {
    const home = drawing({
        x: stage.offsetLeft,
        y: stage.offsetTop,
        width: stage.offsetWidth,
        height: stage.offsetHeight,
    });
    const to = drawing(target);
    if (!home.width || !to.width) return "";
    const dx = to.x + to.width / 2 - (home.x + home.width / 2);
    const dy = to.y + to.height / 2 - (home.y + home.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${to.width / home.width})`;
}

// The sidebar portrait the avatar lands in; on narrow screens, the student menu button.
function findSeat(): { box: DOMRect; avatar: SVGElement | null } | null {
    for (const seat of document.querySelectorAll("[data-student-portrait]")) {
        const avatar = seat.querySelector<SVGElement>(".avatar");
        const box = (avatar ?? seat).getBoundingClientRect();
        if (box.width && box.height) return { box, avatar };
    }
    const rail = document.querySelector("[data-student-rail]");
    const box = rail?.getBoundingClientRect();
    return box?.width ? { box, avatar: null } : null;
}

interface YearOneIntroArgs {
    character: Character;
    from: SVGElement | null; // the avatar on the acceptance letter; hidden while its copy flies
    onEnter(): void; // the screen is covered: start Year 1 underneath
    onDone(): void;
}

export default function YearOneIntro(args: YearOneIntroArgs) {
    const [step, setStep] = useState<Step>("enter");
    const [dim, setDim] = useState(false);
    const [expression, setExpression] = useState<AvatarExpression>("happy");
    const [blinking, setBlinking] = useState(false);
    const [phrase, setPhrase] = useState<number | null>(null); // ATTACKS.length: the finale
    const [hits, setHits] = useState(0);
    const [knockback, setKnockback] = useState(0); // -1 left, 1 right, 0 down
    const [hearts, setHearts] = useState(HEARTS);
    const stage = useRef<HTMLDivElement>(null);
    const skipButton = useRef<HTMLButtonElement>(null);
    const timeline = useRef<PresentationTimeline | null>(null);
    const callbacks = useRef(args);
    callbacks.current = args;

    // Start exactly over the letter's avatar, before the first paint.
    useLayoutEffect(() => {
        const element = stage.current;
        const letter = args.from;
        if (!element || !letter) return;
        element.style.transition = "none";
        element.style.transform = cover(
            element,
            letter.getBoundingClientRect(),
        );
        letter.style.setProperty("visibility", "hidden");
        return () => {
            letter.style.removeProperty("visibility");
        };
    }, []);

    useEffect(() => {
        const run = new PresentationTimeline();
        timeline.current = run;
        let entered = false;
        let finished = false;
        let seated: SVGElement | null = null;
        skipButton.current?.focus({ preventScroll: true });

        function enter() {
            if (entered) return;
            entered = true;
            callbacks.current.onEnter();
        }
        function finish() {
            if (finished || !run.active) return;
            finished = true;
            enter();
            seated?.style.removeProperty("visibility");
            callbacks.current.onDone();
        }
        const pause = async (ms: number) => {
            await run.wait(ms);
            return run.active && !run.skipped;
        };
        function hit(damage: number, direction: number, finale = false) {
            setKnockback(direction);
            setHits((count) => count + 1);
            setHearts((left) => Math.max(1, left - damage));
            setExpression(finale ? "crying" : "hurt");
        }
        async function blink() {
            setBlinking(true);
            const going = await pause(BLINK_MS);
            setBlinking(false);
            return going;
        }

        async function play() {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (!run.active) return;
            if (run.skipped) return finish();
            const element = stage.current;
            if (element) {
                element.style.removeProperty("transition");
                element.style.removeProperty("transform");
            }
            setDim(true);
            if (!(await pause(ENTER_MS))) return finish();

            // Happy, and blinking, to have made it in. The backdrop is opaque by the first
            // blink, so Year 1 can start underneath unseen.
            setStep("happy");
            if (!(await pause(400))) return finish();
            enter();
            if (!(await blink())) return finish();
            if (!(await pause(760))) return finish();
            if (!(await blink())) return finish();
            if (!(await pause(HAPPY_MS - 400 - 760 - 2 * BLINK_MS)))
                return finish();

            setStep("attack");
            for (const [i, attack] of ATTACKS.entries()) {
                setPhrase(i);
                if (!(await pause(ATTACK_HIT_MS))) return finish();
                hit(attack.damage, attack.x < 0 ? 1 : -1);
                if (!(await pause(ATTACK_MS - ATTACK_HIT_MS + ATTACK_GAP_MS)))
                    return finish();
            }
            setPhrase(null);
            if (!(await pause(500))) return finish();

            setStep("finale");
            setPhrase(ATTACKS.length);
            if (!(await pause(FINALE_HIT_MS))) return finish();
            hit(FINALE.damage, 0, true);
            if (!(await pause(FINALE_MS - FINALE_HIT_MS + AFTERMATH_MS)))
                return finish();

            // Pull yourself together and take your seat.
            setPhrase(null);
            setStep("exit");
            setDim(false);
            setExpression("calm");
            const seat = findSeat();
            if (element) {
                element.style.transitionDuration = `${EXIT_MS}ms`;
                if (seat) element.style.transform = cover(element, seat.box);
                if (!seat?.avatar) element.style.opacity = "0";
            }
            seated = seat?.avatar ?? null;
            seated?.style.setProperty("visibility", "hidden");
            await pause(EXIT_MS);
            finish();
        }
        void play();
        return () => {
            run.dispose();
            seated?.style.removeProperty("visibility");
        };
    }, []);

    useEffect(() => {
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") timeline.current?.skip();
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    const finale = phrase === ATTACKS.length;
    const attack = phrase === null || finale ? null : ATTACKS[phrase];
    const hurtClass =
        hits === 0
            ? step === "happy"
                ? styles.hop
                : ""
            : knockback === 0
              ? styles.hurtBig
              : styles.hurt;

    return (
        <div
            className={styles.intro}
            data-step={step}
            data-dim={dim}
            data-quake={step === "finale" && hits > ATTACKS.length}
            role="dialog"
            aria-modal="true"
            aria-label="Your first day at ETH"
        >
            <div className={styles.backdrop} />
            <div className={styles.glow} aria-hidden="true" />
            <div className={styles.vignette} aria-hidden="true" />
            <div ref={stage} className={styles.stage}>
                <div
                    key={`body-${hits}`}
                    className={`${styles.body} ${hurtClass}`}
                    style={{ "--knockback": knockback } as CSSProperties}
                >
                    <Avatar
                        character={args.character}
                        expression={expression}
                        blinking={blinking}
                    />
                </div>
                {hits > 0 && (
                    <span
                        key={`sparks-${hits}`}
                        className={styles.sparks}
                        aria-hidden
                    >
                        {Array.from({ length: 8 }, (_, i) => (
                            <i
                                key={i}
                                style={
                                    {
                                        "--angle": `${i * 45 + 20}deg`,
                                    } as CSSProperties
                                }
                            />
                        ))}
                    </span>
                )}
            </div>
            <p className={styles.caption} aria-hidden="true">
                You got into ETH!
            </p>
            {attack && (
                <span
                    key={`phrase-${phrase}`}
                    className={styles.phrase}
                    style={
                        {
                            "--from-x": `${attack.x}vw`,
                            "--from-y": `${attack.y}vh`,
                        } as CSSProperties
                    }
                >
                    {attack.text}
                </span>
            )}
            {finale && (
                <span className={`${styles.phrase} ${styles.finale}`}>
                    {FINALE.text}
                </span>
            )}
            <div
                key={`hearts-${hits}`}
                className={styles.hearts}
                data-hit={hits > 0}
                aria-label={`${hearts / 2} of ${HEARTS / 2} hearts left`}
                role="img"
            >
                {Array.from({ length: HEARTS / 2 }, (_, i) => (
                    <PixelHeart
                        key={i}
                        fill={
                            hearts >= 2 * (i + 1)
                                ? "full"
                                : hearts === 2 * i + 1
                                  ? "half"
                                  : "empty"
                        }
                    />
                ))}
            </div>
            <button
                ref={skipButton}
                className={`button ghost compact ${styles.skip}`}
                onClick={() => timeline.current?.skip()}
            >
                Skip intro
            </button>
        </div>
    );
}
