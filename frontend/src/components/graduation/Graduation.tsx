import { useRef, useState } from "react";
import Avatar from "../common/Avatar";
import Icon from "../common/Icon";
import { apiGraduateRun } from "../../misc/apiClient";
import { DEPARTMENTS } from "../../misc/character";
import { GAMES, TOTAL_ECTS } from "../../misc/shellConfig";
import { runHref } from "../../misc/run";
import type { Run } from "../../misc/CommonInt";
import { shellClass } from "../../misc/shellStyles";

interface GraduationArgs {
    initialRun: Run;
}
export default function Graduation(args: GraduationArgs) {
    const [run, setRun] = useState(args.initialRun);
    const [opened, setOpened] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
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
