import { useRef, useState } from "react";
import ShellLayout from "../common/ShellLayout";
import RunStatus from "../common/RunStatus";
import Icon from "../common/Icon";
import PlayerHeader from "./PlayerHeader";
import ActivityCard from "./ActivityCard";
import { useRun } from "../../misc/useRun";
import { GAMES, TOTAL_ECTS } from "../../misc/shellConfig";
import { apiGraduateRun } from "../../misc/apiClient";
import { runHref } from "../../misc/run";
import { shellClass } from "../../misc/shellStyles";

export default function App() {
    const result = useRun();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const saving = useRef(false);
    const run = result.data;
    const eligible =
        !!run &&
        run.ectsPoints === TOTAL_ECTS &&
        GAMES.every((game) => run.completedGameIds.includes(game.id));
    async function handleGraduate() {
        if (!run || !eligible || saving.current) return;
        saving.current = true;
        setBusy(true);
        setError("");
        const saved = await apiGraduateRun(run.id);
        if (saved.data) window.location.href = runHref("/graduation", run.id);
        else {
            setError(saved.error || "Graduation could not be saved.");
            saving.current = false;
            setBusy(false);
        }
    }
    return (
        <ShellLayout title="Campus">
            <RunStatus
                loading={result.loading}
                error={result.error}
                onRetry={result.reload}
            >
                {run && (
                    <>
                        <PlayerHeader run={run} />
                        <p className={shellClass("guest-note")}>
                            Keep this page’s address to return to your student
                            record.
                        </p>
                        <div className={shellClass("overview-heading")}>
                            <div>
                                <span className={shellClass("eyebrow")}>
                                    THE THREE-YEAR PLAN
                                </span>
                                <h2>Your degree, one challenge at a time.</h2>
                            </div>
                        </div>
                        <div className={shellClass("years-stack")}>
                            {GAMES.map((game, index) => (
                                <ActivityCard
                                    key={game.id}
                                    game={game}
                                    run={run}
                                    index={index}
                                />
                            ))}
                        </div>
                        <div
                            className={shellClass(
                                `graduation-panel ${eligible ? "ready" : ""}`,
                            )}
                        >
                            <div
                                className={shellClass("graduation-requirement")}
                            >
                                <span className={shellClass("graduation-icon")}>
                                    <Icon name="cap" size={28} />
                                </span>
                                <div>
                                    <h3>Your diploma is waiting.</h3>
                                    <p>
                                        {eligible
                                            ? "Both challenges complete. Go claim your moment."
                                            : `Complete both minigames and earn ${TOTAL_ECTS - run.ectsPoints} more ECTS to graduate.`}
                                    </p>
                                </div>
                            </div>
                            <button
                                className={shellClass("button primary")}
                                disabled={!eligible || busy}
                                onClick={() => void handleGraduate()}
                            >
                                {busy ? "Saving…" : "Graduate"}
                                <Icon
                                    name={eligible ? "arrow" : "lock"}
                                    size={18}
                                />
                            </button>
                        </div>
                        {error && (
                            <p className={shellClass("error-box")} role="alert">
                                {error}
                            </p>
                        )}
                    </>
                )}
            </RunStatus>
        </ShellLayout>
    );
}
