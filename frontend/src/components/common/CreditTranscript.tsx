// The degree's credits, row by row: each year's game, its score and the ECTS it paid, summed
// to the total on a bar marked with the ECTS each career starts at, so a player always sees
// what they are on track to become. Used in the student record, on the graduation screen and
// on the diploma (credits.ts does the arithmetic).
import type { CSSProperties } from "react";
import type { CreditSummary } from "../../misc/credits";
import { fill, TEXT } from "../../misc/text";
import styles from "./CreditTranscript.module.css";

const T = TEXT.credits;

interface CreditTranscriptArgs {
    summary: CreditSummary;
    final?: boolean; // the degree is done: "Your future" instead of "On track for"
    compact?: boolean; // the narrow student record: no career legend
    highlight?: string; // a game id just completed
}

export default function CreditTranscript(args: CreditTranscriptArgs) {
    const { summary } = args;
    const careers = summary.thresholds.slice(1);
    return (
        <section
            className={`${styles.transcript} ${args.compact ? styles.compact : ""}`}
            aria-label={T.title}
        >
            <header className={styles.header}>
                <span>{T.title}</span>
                <strong>
                    {fill(T.total, {
                        earned: summary.earned,
                        total: summary.total,
                    })}
                </strong>
            </header>
            <div
                className={styles.scale}
                role="progressbar"
                aria-label={T.progressLabel}
                aria-valuemin={0}
                aria-valuemax={summary.total}
                aria-valuenow={summary.earned}
            >
                <span
                    className={styles.fill}
                    style={{ width: `${summary.percent}%` }}
                />
                {careers.map((mark) => (
                    <i
                        key={mark.id}
                        className={`${styles.tick} ${summary.earned >= mark.ects ? styles.reached : ""}`}
                        style={
                            {
                                "--at": `${(100 * mark.ects) / summary.total}%`,
                            } as CSSProperties
                        }
                        title={`${mark.title} · ${fill(T.careerFrom, { ects: mark.ects })}`}
                    />
                ))}
            </div>
            <p className={styles.career}>
                <span>{args.final ? T.becomes : T.onTrack}</span>
                <strong>{summary.ending.title}</strong>
            </p>
            {!args.final && (
                <small className={styles.next}>
                    {summary.next
                        ? fill(T.next, {
                              ects: summary.next.ectsNeeded,
                              career: summary.next.title,
                          })
                        : T.top}
                </small>
            )}
            <ol className={styles.rows}>
                {summary.rows.map((row) => (
                    <li
                        key={row.gameId}
                        className={`${row.earned === null ? styles.pending : ""} ${args.highlight === row.gameId ? styles.fresh : ""}`}
                    >
                        <span className={styles.rowTitle}>
                            <small>{row.yearTitle}</small>
                            {row.gameTitle}
                        </span>
                        <span className={styles.rowScore}>
                            {row.earned === null
                                ? ""
                                : row.score === null
                                  ? T.noScore
                                  : fill(T.score, { score: row.score })}
                        </span>
                        <span className={styles.rowEcts}>
                            {row.earned === null
                                ? fill(T.pending, { available: row.available })
                                : fill(T.earned, {
                                      earned: row.earned,
                                      available: row.available,
                                  })}
                        </span>
                        <span className={styles.rowBar} aria-hidden="true">
                            <i
                                style={{
                                    width: `${(100 * (row.earned ?? 0)) / row.available}%`,
                                }}
                            />
                        </span>
                    </li>
                ))}
                <li className={styles.sum}>
                    <span className={styles.rowTitle}>{T.sum}</span>
                    <span className={styles.rowScore} />
                    <span className={styles.rowEcts}>
                        {fill(T.total, {
                            earned: summary.earned,
                            total: summary.total,
                        })}
                    </span>
                </li>
            </ol>
            {!args.compact && (
                <div className={styles.legend}>
                    <span>{T.careerScale}</span>
                    <ol>
                        {[...summary.thresholds].reverse().map((mark) => (
                            <li
                                key={mark.id}
                                className={
                                    mark.id === summary.ending.id
                                        ? styles.current
                                        : ""
                                }
                            >
                                <span>{mark.title}</span>
                                <small>
                                    {fill(T.careerFrom, { ects: mark.ects })}
                                </small>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}
