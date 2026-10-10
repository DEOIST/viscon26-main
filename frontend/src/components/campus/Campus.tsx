// The story hub between minigames. SKELETON for the curriculum screen (issue #8): keep the data
// flow (run, advisor dialogue, graduate), restyle and extend freely.

import { useEffect, useState } from "react";
import Avatar from "../common/Avatar";
import MissingRun from "../common/MissingRun";
import {
    apiGenerateDialogue,
    apiGetRunById,
    apiGraduateRun,
} from "../../misc/apiClient";
import { DEPARTMENTS, GAME_IDS, GAMES } from "../../misc/character";
import { runHref } from "../../misc/run";
import { useApi } from "../../misc/useApi";
import styles from "./Campus.module.css";

interface CampusArgs {
    runId: string;
}

const SEMESTERS = ["Semester 1", "Semester 2", "Graduation day"];

export default function Campus(args: CampusArgs) {
    const run = useApi(() => apiGetRunById(args.runId), [args.runId]);
    const dialogue = useApi(
        () => apiGenerateDialogue(args.runId, { scene: "campus" }),
        [args.runId],
    );
    const [graduating, setGraduating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (run.data?.ending)
            window.location.replace(runHref("/graduation", args.runId));
    }, [run.data, args.runId]);

    async function handleGraduate() {
        setGraduating(true);
        const res = await apiGraduateRun(args.runId);
        if (res.error !== null) {
            setError(res.error);
            setGraduating(false);
            return;
        }
        window.location.href = runHref("/graduation", args.runId);
    }

    if (run.error !== null) return <MissingRun error={run.error} />;
    if (run.data === null) return <p className={styles.muted}>Loading…</p>;

    const character = run.data.character;
    const scores = run.data.scores;
    const finishedCount = GAME_IDS.filter((game) => game in scores).length;
    const canGraduate = finishedCount === GAME_IDS.length;

    return (
        <div className={styles.campus}>
            <p className={styles.semester}>{SEMESTERS[finishedCount]}</p>

            <section className={styles.legi}>
                <Avatar character={character} />
                <div>
                    <strong>{character.name}</strong>
                    <div className={styles.muted}>
                        {DEPARTMENTS[character.department]}
                    </div>
                    <div className={styles.muted}>
                        Student no. {run.data.id.slice(0, 8)}
                    </div>
                </div>
            </section>

            <section className={styles.advisor}>
                {dialogue.loading && dialogue.data === null && (
                    <p className={styles.muted}>Dr. Gradient is coming…</p>
                )}
                {dialogue.data?.lines.advisor?.map((line) => (
                    <p key={line}>{line}</p>
                ))}
            </section>

            <section className={styles.activities}>
                {GAME_IDS.map((game) => (
                    <a
                        key={game}
                        href={runHref(`/${game}`, args.runId)}
                        className={styles.activity}
                    >
                        <strong>{GAMES[game].title}</strong>
                        <span className={styles.muted}>
                            {GAMES[game].tagline}
                        </span>
                        <span>
                            {game in scores
                                ? `Score ${scores[game]} · play again`
                                : "Play"}
                        </span>
                    </a>
                ))}
            </section>

            {error && <p className={styles.error}>{error}</p>}
            <button
                className={styles.primary}
                onClick={handleGraduate}
                disabled={!canGraduate || graduating}
            >
                {canGraduate
                    ? "Graduate"
                    : "Finish both challenges to graduate"}
            </button>
        </div>
    );
}
