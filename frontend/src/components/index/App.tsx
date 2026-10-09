// Title screen: the way in (enroll) and the Hall of Fame. SKELETON for the "Screen Welcome"
// work (issue #6): keep the data flow, restyle freely.

import Avatar from "../common/Avatar";
import Layout from "../common/Layout";
import { apiListLeaderboard } from "../../misc/apiClient";
import { DEPARTMENTS, ENDING_TITLES } from "../../misc/character";
import { useApi } from "../../misc/useApi";
import styles from "./App.module.css";

export default function App() {
    const leaderboard = useApi(() => apiListLeaderboard(10));

    return (
        <Layout title="Welcome">
            <section className={styles.hero}>
                <h1 className={styles.title}>ETH Life</h1>
                <p className={styles.tagline}>
                    Create your student, survive casino night and the
                    Basisprüfung, and find out where your diploma takes you.
                </p>
                <a href="/enroll" className={styles.cta}>
                    Enroll at ETH
                </a>
            </section>

            <section>
                <h2>Hall of Fame</h2>
                {leaderboard.loading && leaderboard.data === null && (
                    <p className={styles.muted}>Loading…</p>
                )}
                {leaderboard.error && (
                    <p className={styles.error}>{leaderboard.error}</p>
                )}
                {leaderboard.data?.length === 0 && (
                    <p className={styles.muted}>
                        Nobody has graduated yet. Be the first.
                    </p>
                )}
                <ol className={styles.ranking}>
                    {leaderboard.data?.map((entry) => (
                        <li key={entry.runId} className={styles.entry}>
                            <Avatar avatar={entry.avatar} name={entry.name} />
                            <span>
                                <strong>{entry.name}</strong>
                                <br />
                                <small className={styles.muted}>
                                    {DEPARTMENTS[entry.department]}
                                </small>
                            </span>
                            <span>{ENDING_TITLES[entry.endingId]}</span>
                            <span className={styles.score}>
                                {entry.totalScore}
                            </span>
                        </li>
                    ))}
                </ol>
            </section>
        </Layout>
    );
}
