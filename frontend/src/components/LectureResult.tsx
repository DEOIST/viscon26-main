// A finished lecture's result on its launch panel: the ECTS it paid on a speedometer out of the
// year's credits, the needle sweeping up from zero, and a line teasing the player about it.
// The wording is workspace.lectureResult in shared/text.json.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { playGaugeSound } from "../gaugeSound";
import type { NeedleMotion } from "../gaugeSound";
import { PresentationTimeline } from "../misc/motion";
import { fill, TEXT } from "../misc/text";
import styles from "./LectureResult.module.css";

const T = TEXT.workspace.lectureResult;
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const SWEEP_MS = 1100; // keep in sync with the needle and arc animations
// The needle's own animation, for the sound that follows it: keep in sync with .needle.
const NEEDLE: NeedleMotion = {
    delayMs: 150,
    sweepMs: SWEEP_MS,
    easing: [0.3, 1.35, 0.5, 1],
};

// The arc is a half circle around (100, 100); `share` 0 is its left end, 1 its right end.
const ARC = "M20 100A80 80 0 0 1 180 100";
const pointOnArc = (share: number, radius: number) => {
    const angle = Math.PI * (1 - share);
    return {
        x: 100 + radius * Math.cos(angle),
        y: 100 - radius * Math.sin(angle),
    };
};

export function teaseFor(score: number): string {
    return (
        T.teases.find((tease) => score >= tease.minScore)?.text ??
        T.teases[T.teases.length - 1].text
    );
}

interface LectureResultArgs {
    earned: number;
    ects: number;
    score: number; // 0–100
}

export default function LectureResult(args: LectureResultArgs) {
    const share = Math.min(1, Math.max(0, args.earned / args.ects));
    const [shown, setShown] = useState(0);

    // The number counts up with the needle; reduced motion shows the result at once. The sound
    // starts here too, so it plays every time the gauge animates (each time a result appears or
    // changes), not once per visit, and stops with the gauge.
    useEffect(() => {
        const run = new PresentationTimeline();
        const stopSound = run.skipped ? null : playGaugeSound(share, NEEDLE);
        void run.frames(SWEEP_MS, (t) =>
            setShown(Math.round(args.earned * (1 - (1 - t) ** 3))),
        );
        return () => {
            run.dispose();
            stopSound?.();
        };
    }, [args.earned]);

    return (
        <section
            className={styles.result}
            role="meter"
            aria-label={T.label}
            aria-valuemin={0}
            aria-valuemax={args.ects}
            aria-valuenow={args.earned}
            aria-valuetext={`${args.earned} ${fill(T.outOf, { ects: args.ects })}`}
            style={
                {
                    "--share": share,
                    "--needle": `${-90 + 180 * share}deg`,
                } as CSSProperties
            }
        >
            <svg
                className={styles.gauge}
                viewBox="0 0 200 120"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="lecture-gauge" x1="0" x2="1">
                        <stop offset="0" stopColor="#ee5a78" />
                        <stop offset="0.5" stopColor="#ffd479" />
                        <stop offset="1" stopColor="#a4d65e" />
                    </linearGradient>
                </defs>
                <path className={styles.track} d={ARC} pathLength={100} />
                {share > 0 && (
                    <path
                        className={styles.value}
                        d={ARC}
                        pathLength={100}
                        stroke="url(#lecture-gauge)"
                    />
                )}
                {TICKS.map((tick) => {
                    const outer = pointOnArc(tick, 98);
                    const inner = pointOnArc(tick, 91);
                    const label = pointOnArc(tick, 62);
                    return (
                        <g key={tick} className={styles.tick}>
                            <line
                                x1={inner.x}
                                y1={inner.y}
                                x2={outer.x}
                                y2={outer.y}
                            />
                            <text x={label.x} y={label.y + 3}>
                                {Math.round(tick * args.ects)}
                            </text>
                        </g>
                    );
                })}
                <g className={styles.needle}>
                    <path d="M100 32 104 100 96 100Z" />
                    <circle cx="100" cy="100" r="8" />
                </g>
            </svg>
            <p className={styles.reading}>
                <strong>{shown}</strong>
                <span>{fill(T.outOf, { ects: args.ects })}</span>
            </p>
            <p className={styles.score}>
                {fill(T.score, { score: args.score })}
            </p>
            <p className={styles.tease}>{teaseFor(args.score)}</p>
            <p className={styles.note}>{T.replayNote}</p>
        </section>
    );
}
