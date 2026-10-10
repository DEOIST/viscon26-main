import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, errorMessage, type ScoreRow } from "../api";
import { departmentLabel, TOTAL_ECTS } from "../config";
import { Icon } from "./Icon";
import { PresentationTimeline } from "../misc/motion";

export function Dialog({
    title,
    children,
    onClose,
    busy = false,
    wide = false,
    className = "",
    closeLabel = "Close dialog",
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    busy?: boolean;
    wide?: boolean;
    className?: string;
    closeLabel?: string;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const closing = useRef<PresentationTimeline | null>(null);
    async function handleClose() {
        if (busy || closing.current?.active) return;
        const run = new PresentationTimeline();
        closing.current = run;
        ref.current?.classList.add("is-closing");
        await run.wait(160);
        if (run.active) onClose();
    }
    useEffect(() => {
        const dialog = ref.current!;
        const trigger = document.activeElement as HTMLElement | null;
        dialog.showModal();
        dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
        return () => {
            closing.current?.dispose();
            dialog.close();
            trigger?.focus();
        };
    }, []);
    return (
        <dialog
            className={`dialog ${wide ? "dialog-wide" : ""} ${className}`}
            ref={ref}
            aria-labelledby="dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) void handleClose();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget && !busy)
                    void handleClose();
            }}
        >
            <div className="dialog-inner">
                <div className="dialog-heading">
                    <h2 id="dialog-title">{title}</h2>
                    <button
                        className="icon-button"
                        aria-label={closeLabel}
                        disabled={busy}
                        onClick={() => void handleClose()}
                    >
                        <Icon name="close" />
                    </button>
                </div>
                <div className="dialog-body">{children}</div>
            </div>
        </dialog>
    );
}

export function ScoreboardDialog({ onClose }: { onClose: () => void }) {
    const [rows, setRows] = useState<ScoreRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        api.scoreboard()
            .then((data) => {
                if (active) setRows(data);
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
    }, [attempt]);
    return (
        <Dialog title="The student scoreboard" onClose={onClose} wide>
            <p>Big effort. Small bragging rights. Anonymous player runs.</p>
            {loading ? (
                <p className="empty-state" role="status">
                    Checking the student records…
                </p>
            ) : error ? (
                <div className="empty-state">
                    <p role="alert" className="error-text">
                        {error}
                    </p>
                    <button
                        className="button secondary"
                        onClick={() => setAttempt((value) => value + 1)}
                    >
                        Try again
                    </button>
                </div>
            ) : rows.length === 0 ? (
                <div className="empty-state">
                    <Icon name="trophy" size={36} />
                    <h3>A very exclusive club of zero.</h3>
                    <p>
                        No student records yet. Create your character and play
                        to get listed.
                    </p>
                </div>
            ) : (
                <div className="table-scroll">
                    <table>
                        <caption className="sr-only">
                            Top 100 students, ordered by ECTS, then run creation
                            order
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">Rank</th>
                                <th scope="col">Student / major</th>
                                <th scope="col">ECTS</th>
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr key={index}>
                                    <td className="rank">
                                        {String(index + 1).padStart(2, "0")}
                                    </td>
                                    <td>
                                        <strong>{row.name}</strong>
                                        <small>
                                            {departmentLabel(row.major)}
                                        </small>
                                    </td>
                                    <td className="reward-text">
                                        <strong>{row.ects}</strong>
                                        <small className="text-muted">
                                            / {TOTAL_ECTS}
                                        </small>
                                    </td>
                                    <td>
                                        <span
                                            className={`badge ${row.graduated ? "success" : "neutral"}`}
                                        >
                                            {row.graduated && (
                                                <Icon name="check" size={14} />
                                            )}
                                            {row.graduated
                                                ? "Graduated"
                                                : "Studying"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="scoreboard-footnote">
                ECTS come from completed minigames. Placeholder previews award
                none. Ties follow run creation order. Names are chosen by
                players; they do not verify identity.
            </p>
        </Dialog>
    );
}
