import { useEffect, useRef, useState } from "react";
import Avatar from "../common/Avatar";
import Icon from "../common/Icon";
import Diploma from "./Diploma";
import {
    apiGenerateEpilogue,
    apiGenerateEpilogueSpeech,
    apiGetEndingStats,
    apiGraduateRun,
} from "../../misc/apiClient";
import { GAMES, TOTAL_ECTS } from "../../misc/shellConfig";
import { runHref } from "../../misc/run";
import type { Epilogue, Run } from "../../misc/CommonInt";
import { useApi } from "../../misc/useApi";
import { shellClass } from "../../misc/shellStyles";
import { fill, TEXT } from "../../misc/text";

interface GraduationArgs {
    initialRun: Run;
}
export default function Graduation(args: GraduationArgs) {
    const [run, setRun] = useState(args.initialRun);
    const [opened, setOpened] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const epilogue = useApi<Epilogue>(
        () =>
            run.ending
                ? apiGenerateEpilogue(run.id)
                : Promise.resolve({ data: null, status: 200, error: null }),
        [run.id, run.ending],
    );
    const stats = useApi(apiGetEndingStats);
    useEffect(() => {
        if (!opened || !run.ending || !epilogue.data) return;
        let active = true;
        let narration: string | null = null;
        void apiGenerateEpilogueSpeech(run.id).then((response) => {
            if (!active) {
                if (response.data) URL.revokeObjectURL(response.data);
                return;
            }
            narration = response.data;
            setAudioUrl(narration);
        });
        return () => {
            active = false;
            if (narration) URL.revokeObjectURL(narration);
        };
    }, [opened, run.id, run.ending, epilogue.data]);
    const saving = useRef(false);
    const eligible =
        run.ectsPoints === TOTAL_ECTS &&
        GAMES.every((game) => run.completedGameIds.includes(game.id));
    async function handleOpen() {
        if (saving.current || !eligible) return;
        if (run.graduatedAt) {
            setOpened(true);
            return;
        }
        saving.current = true;
        setBusy(true);
        setError("");
        const saved = await apiGraduateRun(run.id);
        if (saved.data) {
            setRun(saved.data);
            setOpened(true);
            // The stats were loaded before this graduation counted.
            stats.reload();
        } else setError(saved.error || TEXT.legacyGraduation.saveFailed);
        saving.current = false;
        setBusy(false);
    }
    return (
        <section className={shellClass("graduation panel")}>
            <span className={shellClass("eyebrow reward-text")}>
                {opened
                    ? TEXT.graduation.eyebrow
                    : TEXT.legacyGraduation.nextChapter}
            </span>
            {opened && run.ending ? (
                <>
                    <h1>
                        {fill(TEXT.graduation.title, {
                            name: run.character.name,
                        })}
                    </h1>
                    <Diploma
                        run={run}
                        ending={run.ending}
                        epilogue={epilogue.data?.text ?? null}
                        audioUrl={audioUrl}
                        sameFatePercent={
                            stats.data && stats.data.total > 0
                                ? Math.round(
                                      (100 * stats.data.counts[run.ending.id]) /
                                          stats.data.total,
                                  )
                                : null
                        }
                    />
                    <p className={shellClass("graduation-copy")}>
                        {TEXT.legacyGraduation.closing}
                    </p>
                    <a className={shellClass("button primary")} href="/enroll">
                        {TEXT.legacyGraduation.playAgain}
                        <Icon name="arrow" />
                    </a>
                </>
            ) : (
                <>
                    <div className={shellClass("graduate-portrait")}>
                        <Avatar character={run.character} />
                        <span className={shellClass("graduate-seal")}>
                            <Icon name="cap" size={32} />
                        </span>
                    </div>
                    <h1>{TEXT.legacyGraduation.waiting}</h1>
                    <p>
                        {eligible
                            ? TEXT.legacyGraduation.ready
                            : TEXT.legacyGraduation.incomplete}
                    </p>
                    <button
                        className={shellClass("button primary")}
                        disabled={!eligible || busy}
                        onClick={() => void handleOpen()}
                    >
                        {busy ? TEXT.common.saving : TEXT.legacyGraduation.open}
                    </button>
                </>
            )}
            {error && (
                <p className={shellClass("error-box")} role="alert">
                    {error}
                </p>
            )}
            {!run.graduatedAt && (
                <p>
                    <a
                        className={shellClass("button ghost")}
                        href={runHref("/campus", run.id)}
                    >
                        <Icon name="back" />
                        {TEXT.legacyGraduation.returnToCampus}
                    </a>
                </p>
            )}
        </section>
    );
}
