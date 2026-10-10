import { useEffect, useRef, useState } from "react";
import Avatar from "../common/Avatar";
import Icon from "../common/Icon";
import {
    apiGenerateEpilogue,
    apiGenerateEpilogueSpeech,
    apiGetEndingStats,
    apiGraduateRun,
} from "../../misc/apiClient";
import { DEPARTMENTS } from "../../misc/character";
import { GAMES, TOTAL_ECTS } from "../../misc/shellConfig";
import { runHref } from "../../misc/run";
import type { Epilogue, Run } from "../../misc/CommonInt";
import { useApi } from "../../misc/useApi";
import { shellClass } from "../../misc/shellStyles";

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
        } else setError(saved.error || "Your diploma could not be saved.");
        saving.current = false;
        setBusy(false);
    }
    return (
        <section className={shellClass("graduation panel")}>
            <span className={shellClass("eyebrow reward-text")}>
                {opened ? "DEGREE COMPLETE" : "YOUR NEXT CHAPTER"}
            </span>
            <div className={shellClass("graduate-portrait")}>
                <Avatar character={run.character} />
                <span className={shellClass("graduate-seal")}>
                    <Icon name="cap" size={32} />
                </span>
            </div>
            <h1>
                {opened
                    ? `You did it, ${run.character.name}.`
                    : "Your diploma is waiting."}
            </h1>
            {opened ? (
                <>
                    <p className={shellClass("hero-lead")}>
                        {run.ending?.title}
                    </p>
                    <p>
                        {DEPARTMENTS[run.character.department]} Â·{" "}
                        <strong className={shellClass("reward-text")}>
                            {run.ectsPoints} ECTS earned
                        </strong>
                    </p>
                    <p className={shellClass("graduation-copy")}>
                        Congratulations. You may now close those 47 browser
                        tabs.
                        <br />
                        Your degree and progress are staying right here.
                    </p>
                    <p>Minigame average: {run.totalScore} / 100</p>
                    {epilogue.data && <p>{epilogue.data.text}</p>}
                    {audioUrl && <audio src={audioUrl} autoPlay controls />}
                    {run.ending && stats.data && stats.data.total > 0 && (
                        <p>
                            {Math.round(
                                (100 * stats.data.counts[run.ending.id]) /
                                    stats.data.total,
                            )}
                            % of students share your fate.
                        </p>
                    )}
                    {GAMES.map((game) => (
                        <p key={game.id}>
                            {game.title}: {run.scores[game.id]} / 100
                        </p>
                    ))}
                    <a className={shellClass("button primary")} href="/enroll">
                        Play again
                        <Icon name="arrow" />
                    </a>
                </>
            ) : (
                <>
                    <p>
                        {eligible
                            ? "The rector approaches the podiumâ€¦"
                            : "Complete both challenges before claiming your diploma."}
                    </p>
                    <button
                        className={shellClass("button primary")}
                        disabled={!eligible || busy}
                        onClick={() => void handleOpen()}
                    >
                        {busy ? "Savingâ€¦" : "Open your diploma"}
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
                        Return to campus
                    </a>
                </p>
            )}
        </section>
    );
}
