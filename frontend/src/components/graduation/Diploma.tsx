// The ending reveal. SKELETON for the "Screen Graduation" work (issue #10): ending art, the
// typewriter and the pre-generated fallback narration come later; the data flow is complete.

import { useEffect, useState } from "react";
import Avatar from "../common/Avatar";
import {
    apiGenerateEpilogue,
    apiGenerateEpilogueSpeech,
    apiGetEndingStats,
} from "../../misc/apiClient";
import { DEPARTMENTS, GAME_IDS, GAMES } from "../../misc/character";
import { useApi } from "../../misc/useApi";
import type { Run } from "../../misc/CommonInt";
import styles from "./Graduation.module.css";

interface DiplomaArgs {
    run: Run;
}

export default function Diploma(args: DiplomaArgs) {
    const epilogue = useApi(
        () => apiGenerateEpilogue(args.run.id),
        [args.run.id],
    );
    const stats = useApi(apiGetEndingStats);
    const [isOpen, setIsOpen] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isNarratorMissing, setIsNarratorMissing] = useState(false);

    useEffect(() => {
        return () => {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [audioUrl]);

    // The click is what lets the browser play the narration (autoplay policy).
    async function handleOpen() {
        setIsOpen(true);
        const res = await apiGenerateEpilogueSpeech(args.run.id);
        if (res.data !== null) setAudioUrl(res.data);
        else setIsNarratorMissing(true);
    }

    const ending = args.run.ending;
    if (ending === null) return null;
    const character = args.run.character;
    const sameFate =
        stats.data && stats.data.total > 0
            ? Math.round(
                  (100 * stats.data.counts[ending.id]) / stats.data.total,
              )
            : null;

    if (!isOpen)
        return (
            <div className={styles.closed}>
                <p>The rector approaches the podium…</p>
                <button
                    className={styles.primary}
                    onClick={handleOpen}
                    disabled={epilogue.data === null}
                >
                    {epilogue.data === null
                        ? "Printing your diploma…"
                        : "Open your diploma"}
                </button>
            </div>
        );

    return (
        <article className={styles.diploma}>
            <Avatar avatar={character.avatar} name={character.name} isLarge />
            <h1 className={styles.career}>{ending.title}</h1>
            <p className={styles.muted}>
                {character.name} · {DEPARTMENTS[character.department]}
            </p>
            <ul className={styles.scores}>
                {GAME_IDS.map((game) => (
                    <li key={game}>
                        {GAMES[game].title}: {args.run.scores[game] ?? "–"}
                    </li>
                ))}
                <li>
                    <strong>Total: {args.run.totalScore}</strong>
                </li>
            </ul>
            <p className={styles.epilogue}>{epilogue.data?.text}</p>
            {audioUrl && <audio src={audioUrl} autoPlay controls />}
            {isNarratorMissing && (
                <p className={styles.muted}>
                    The rector lost their voice today.
                </p>
            )}
            {sameFate !== null && (
                <p className={styles.muted}>
                    {sameFate} % of students share your fate.
                </p>
            )}
            <a href="/enroll" className={styles.primary}>
                Play again
            </a>
        </article>
    );
}
