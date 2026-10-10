import { useEffect, useState } from "react";
import { api, errorMessage, type ActivitySummary, type Attempt } from "../api";
import { GAMES } from "../config";
import ActivityGraph from "./ActivityGraph";
import { Dialog } from "./Dialogs";
import { Icon } from "./Icon";
import styles from "./HistoryDialog.module.css";

const WHEN = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
});

function gameTitle(id: string): string {
    return GAMES.find((game) => game.id === id)?.title ?? id;
}

function daysText(days: number): string {
    return days === 1 ? "1 day" : `${days} days`;
}

interface HistoryDialogArgs {
    authenticated: boolean;
    onClose(): void;
    onAccount(): void;
}

export default function HistoryDialog(args: HistoryDialogArgs) {
    const [activity, setActivity] = useState<ActivitySummary | null>(null);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [loading, setLoading] = useState(args.authenticated);
    const [error, setError] = useState("");
    const [reloads, setReloads] = useState(0);

    useEffect(() => {
        if (!args.authenticated) return;
        let active = true;
        setLoading(true);
        setError("");
        Promise.all([api.activity(), api.attempts(10)])
            .then(([summary, recent]) => {
                if (!active) return;
                setActivity(summary);
                setAttempts(recent);
            })
            .catch((err) => {
                if (active) setError(errorMessage(err));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [args.authenticated, reloads]);

    if (!args.authenticated)
        return (
            <Dialog title="Your study log" onClose={args.onClose}>
                <div className="empty-state">
                    <Icon name="calendar" size={36} />
                    <h3>Every round, on the record.</h3>
                    <p>
                        Sign in and every round you play lands in your history:
                        your scores, your best runs, a year of activity squares
                        and a daily streak to keep alive.
                    </p>
                    <button
                        className="button primary"
                        data-autofocus
                        onClick={args.onAccount}
                    >
                        <Icon name="user" size={17} /> Log in / Register
                    </button>
                </div>
            </Dialog>
        );

    return (
        <Dialog title="Your study log" onClose={args.onClose} wide>
            {loading ? (
                <p className="empty-state" role="status">
                    Opening your study log…
                </p>
            ) : error || !activity ? (
                <div className="empty-state">
                    <p role="alert" className="error-text">
                        {error || "Your history could not be loaded."}
                    </p>
                    <button
                        className="button secondary"
                        onClick={() => setReloads((value) => value + 1)}
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <dl className={styles.stats}>
                        <div>
                            <dt>Current streak</dt>
                            <dd>{daysText(activity.currentStreak)}</dd>
                        </div>
                        <div>
                            <dt>Longest streak</dt>
                            <dd>{daysText(activity.longestStreak)}</dd>
                        </div>
                        <div>
                            <dt>Rounds played</dt>
                            <dd>{activity.totalAttempts}</dd>
                        </div>
                        {GAMES.filter((game) => game.implemented).map(
                            (game) => (
                                <div key={game.id}>
                                    <dt>Best · {game.title}</dt>
                                    <dd>
                                        {activity.bestScores[game.id] ?? "–"}
                                        <small> / 100</small>
                                    </dd>
                                </div>
                            ),
                        )}
                    </dl>
                    {activity.totalAttempts > 0 &&
                        activity.currentStreak === 0 && (
                            <p className={styles.nudge}>
                                Play a round today to start a new streak.
                            </p>
                        )}
                    <ActivityGraph summary={activity} />
                    <h3 className={styles.heading}>Recent rounds</h3>
                    {attempts.length === 0 ? (
                        <p className="empty-state">
                            No rounds yet. Finish a minigame and it shows up
                            here.
                        </p>
                    ) : (
                        <div className="table-scroll">
                            <table>
                                <caption className="sr-only">
                                    Your ten most recent rounds, newest first
                                </caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Minigame</th>
                                        <th scope="col">Score</th>
                                        <th scope="col">Played</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attempts.map((attempt) => (
                                        <tr key={attempt.id}>
                                            <td>{gameTitle(attempt.gameId)}</td>
                                            <td className="reward-text">
                                                <strong>{attempt.score}</strong>
                                                <small className="text-muted">
                                                    {" "}
                                                    / 100
                                                </small>
                                            </td>
                                            <td>
                                                {WHEN.format(
                                                    new Date(
                                                        attempt.finishedAt,
                                                    ),
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </Dialog>
    );
}
