// The certificate presents a completed run; opening it never submits results.
// The career comes from the earned ECTS (config.ts endingFor), the art from misc/endingArt.ts.
import type { CSSProperties } from "react";
import { DEPARTMENT, GAMES, YEARS, endingFor } from "../config";
import type { Player } from "../types";
import { Avatar } from "./Avatar";
import { Dialog } from "./Dialogs";
import { Icon } from "./Icon";
import { fill, TEXT } from "../misc/text";
import EndingPhoto from "./common/EndingPhoto";
import { ENDING_ART } from "../misc/endingArt";
import CreditTranscript from "./common/CreditTranscript";
import { creditSummary } from "../misc/credits";
import styles from "./Diploma.module.css";

const T = TEXT.diploma;

interface DiplomaArgs {
    player: Player;
    ects: number;
    completedGameIds: string[];
    scores?: Record<string, number>;
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
    const ending = endingFor(args.ects);
    const art = ENDING_ART[ending.id];
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
              ? T.notGraduated
              : T.dateMissing;

    return (
        <Dialog
            title={args.preview ? T.previewDialogTitle : T.dialogTitle}
            onClose={args.onClose}
            closeLabel={T.close}
            className={styles.dialog}
            wide
        >
            <article className={styles.certificate} aria-label={T.label}>
                <div className={styles.celebration} aria-hidden="true">
                    {Array.from({ length: 8 }, (_, i) => (
                        <i
                            key={i}
                            style={{ "--particle": i } as CSSProperties}
                        />
                    ))}
                </div>
                <div className={styles.certificateBrand}>
                    <Icon name="cap" size={24} /> {T.brand}
                </div>
                {args.preview && (
                    <p className={styles.completedGames}>
                        {TEXT.common.previewNotice}
                    </p>
                )}
                <p className={styles.certificateTitle}>{T.title}</p>
                <h2>{fill(T.congratulations, { name: args.player.name })}</h2>
                <p>{args.preview ? T.previewCitation : T.citation}</p>
                <p className={styles.career}>{ending.title}</p>
                <EndingPhoto
                    ending={ending.id}
                    avatar={
                        <Avatar
                            character={args.player.character}
                            label={fill(TEXT.common.graduateAvatarLabel, {
                                name: args.player.name,
                            })}
                        />
                    }
                />
                <p className={styles.resultLabel}>
                    {args.preview ? T.previewResultLabel : T.resultLabel}
                </p>
                <strong className={styles.result}>
                    {fill(TEXT.common.ectsAmount, { ects: args.ects })}
                </strong>
                <div className={styles.credits}>
                    <CreditTranscript
                        final={!args.preview}
                        summary={creditSummary(
                            args.completedGameIds,
                            args.scores ?? {},
                        )}
                    />
                </div>
                <dl className={styles.records}>
                    <div>
                        <dt>{T.records.salary}</dt>
                        <dd>{art.salary}</dd>
                    </div>
                    <div>
                        <dt>{T.records.housing}</dt>
                        <dd>{art.housing}</dd>
                    </div>
                    <div>
                        <dt>{T.records.department}</dt>
                        <dd>{DEPARTMENT}</dd>
                    </div>
                    <div>
                        <dt>{T.records.graduationDate}</dt>
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
                        <dt>{T.records.completedYears}</dt>
                        <dd>
                            {years.length} / {YEARS.length}
                        </dd>
                    </div>
                    <div>
                        <dt>{T.records.completedGames}</dt>
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
                <p className={styles.congratulations}>{T.closing}</p>
                <p className={styles.unofficial}>{T.disclaimer}</p>
            </article>
            {!args.preview && args.submissionError && (
                <div className={styles.submission} role="status">
                    <p>{T.submissionFailed}</p>
                    <p className="error-text">{args.submissionError}</p>
                    {args.onRetry && (
                        <button
                            className="button secondary"
                            disabled={args.submitting}
                            onClick={args.onRetry}
                        >
                            {args.submitting
                                ? TEXT.common.submitting
                                : TEXT.common.retryLeaderboard}
                        </button>
                    )}
                </div>
            )}
            <div className={styles.actions}>
                <button className="button primary" onClick={args.onLeaderboard}>
                    <Icon name="trophy" /> {TEXT.common.viewLeaderboard}
                </button>
                <button className="button secondary" onClick={args.onClose}>
                    {T.backToGraduation}
                </button>
            </div>
        </Dialog>
    );
}
