import Dialog from "./Dialog";
import Icon from "./Icon";
import { apiListLeaderboard } from "../../misc/apiClient";
import { DEPARTMENTS, ENDING_TITLES } from "../../misc/character";
import { useApi } from "../../misc/useApi";
import { shellClass } from "../../misc/shellStyles";

interface ScoreboardDialogArgs {
    onClose(): void;
}
export default function ScoreboardDialog(args: ScoreboardDialogArgs) {
    const rows = useApi(apiListLeaderboard);
    return (
        <Dialog title="The Hall of Fame" onClose={args.onClose}>
            <p>Graduated students, ranked by their minigame average.</p>
            {rows.loading ? (
                <p className={shellClass("empty-state")} role="status">
                    Checking the student records…
                </p>
            ) : rows.error ? (
                <div className={shellClass("empty-state")}>
                    <p role="alert">{rows.error}</p>
                    <button
                        className={shellClass("button secondary")}
                        onClick={rows.reload}
                    >
                        Try again
                    </button>
                </div>
            ) : !rows.data?.length ? (
                <div className={shellClass("empty-state")}>
                    <Icon name="trophy" size={36} />
                    <h3>A very exclusive club of zero.</h3>
                    <p>No graduates yet. Your future is still unwritten.</p>
                </div>
            ) : (
                <div className={shellClass("table-scroll")}>
                    <table>
                        <caption className={shellClass("sr-only")}>
                            Top ten graduates by average score
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">Rank</th>
                                <th scope="col">Student / department</th>
                                <th scope="col">Score</th>
                                <th scope="col">Career</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.data.map((row, index) => (
                                <tr key={row.runId}>
                                    <td className={shellClass("rank")}>
                                        {index + 1}
                                    </td>
                                    <td>
                                        <strong>{row.name}</strong>
                                        <small>
                                            {DEPARTMENTS[row.department]}
                                        </small>
                                    </td>
                                    <td className={shellClass("reward-text")}>
                                        {row.totalScore} / 100
                                    </td>
                                    <td>{ENDING_TITLES[row.endingId]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className={shellClass("scoreboard-footnote")}>
                Preview minigames award no scores or ECTS.
            </p>
        </Dialog>
    );
}
