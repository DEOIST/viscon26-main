// The certificate presents a completed run; opening it never submits results.
import type { CSSProperties } from "react";
import { DEPARTMENT, GAMES, YEARS } from "../config";
import type { Player } from "../types";
import { Avatar } from "./Avatar";
import { Dialog } from "./Dialogs";
import { Icon } from "./Icon";
import styles from "./Diploma.module.css";

interface DiplomaArgs {
    player: Player;
    ects: number;
    completedGameIds: string[];
    graduatedAt: string | null;
    preview?: boolean;
    submissionError?: string;
    submitting?: boolean;
    onRetry?: () => void;
    onClose: () => void;
    onLeaderboard: () => void;
}

export default function Diploma(args: DiplomaArgs) {
    const completed = new Set(args.completedGameIds);
    const games = GAMES.filter((game) => completed.has(game.id));
    const years = YEARS.filter((year) =>
        year.games.every((game) => completed.has(game.id)),
    );
    const date = args.graduatedAt ? new Date(args.graduatedAt) : null;
    const graduationDate =
        date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
              })
            : args.preview
              ? "Not graduated"
              : "Date not recorded";

    return (
        <Dialog
            title={
                args.preview
                    ? "Your game diploma · Preview"
                    : "Your game diploma"
            }
            onClose={args.onClose}
            closeLabel="Close diploma"
            className={styles.dialog}
            wide
        >
            <article className={styles.certificate} aria-label="Game diploma">
                <div className={styles.celebration} aria-hidden="true">
                    {Array.from({ length: 8 }, (_, i) => (
                        <i
                            key={i}
                            style={{ "--particle": i } as CSSProperties}
                        />
                    ))}
                </div>
                <div className={styles.certificateBrand}>
                    <Icon name="cap" size={24} /> ETH AFTER HOURS
                </div>
                {args.preview && (
                    <p className={styles.completedGames}>
                        Test preview · Your progress and leaderboard are
                        unchanged.
                    </p>
                )}
                <p className={styles.certificateTitle}>
                    Diploma of determined survival
                </p>
                <h2>Congratulations, {args.player.name}!</h2>
                <div className={styles.certificateHero}>
                    <div className={styles.avatarFrame}>
                        <Avatar
                            character={args.player.character}
                            label={`Graduate ${args.player.name}`}
                        />
                    </div>
                    <div>
                        <p>
                            {args.preview
                                ? "A preview of the diploma awaiting your completed degree."
                                : "Awarded for an impressive commitment to the degree, the deadlines, and the plot."}
                        </p>
                        <p className={styles.resultLabel}>
                            {args.preview ? "Current result" : "Final result"} ·
                            Total earned ECTS
                        </p>
                        <strong className={styles.result}>
                            {args.ects} ECTS
                        </strong>
                    </div>
                </div>
                <dl className={styles.records}>
                    <div>
                        <dt>Department</dt>
                        <dd>{DEPARTMENT}</dd>
                    </div>
                    <div>
                        <dt>Graduation date</dt>
                        <dd>
                            {date && !Number.isNaN(date.getTime()) ? (
                                <time dateTime={args.graduatedAt!}>
                                    {graduationDate}
                                </time>
                            ) : (
                                graduationDate
                            )}
                        </dd>
                    </div>
                    <div>
                        <dt>Completed years</dt>
                        <dd>
                            {years.length} / {YEARS.length}
                        </dd>
                    </div>
                    <div>
                        <dt>Completed minigames</dt>
                        <dd>
                            {games.length} / {GAMES.length}
                        </dd>
                    </div>
                </dl>
                {games.length > 0 && (
                    <p className={styles.completedGames}>
                        {games.map((game) => game.title).join(" · ")}
                    </p>
                )}
                <p className={styles.congratulations}>
                    You may now close those 47 browser tabs. You have earned it.
                </p>
                <p className={styles.unofficial}>
                    Unofficial game diploma · No affiliation with or endorsement
                    by ETH Zürich. This is not an academic qualification.
                </p>
            </article>
            {!args.preview && args.submissionError && (
                <div className={styles.submission} role="status">
                    <p>
                        Your completed run and diploma are saved in this
                        browser. The leaderboard update needs another try.
                    </p>
                    <p className="error-text">{args.submissionError}</p>
                    {args.onRetry && (
                        <button
                            className="button secondary"
                            disabled={args.submitting}
                            onClick={args.onRetry}
                        >
                            {args.submitting
                                ? "Submitting…"
                                : "Retry leaderboard update"}
                        </button>
                    )}
                </div>
            )}
            <div className={styles.actions}>
                <button className="button primary" onClick={args.onLeaderboard}>
                    <Icon name="trophy" /> View leaderboard
                </button>
                <button className="button secondary" onClick={args.onClose}>
                    Back to graduation
                </button>
            </div>
        </Dialog>
    );
}
