import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";
import { api, errorMessage, type ScoreRow, type SessionData } from "../api";
import { departmentLabel, TOTAL_ECTS } from "../config";
import { Icon } from "./Icon";

function Dialog({
    title,
    children,
    onClose,
    busy = false,
    wide = false,
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    busy?: boolean;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current!;
        const trigger = document.activeElement as HTMLElement | null;
        dialog.showModal();
        dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
        return () => {
            dialog.close();
            trigger?.focus();
        };
    }, []);
    return (
        <dialog
            className={`dialog ${wide ? "dialog-wide" : ""}`}
            ref={ref}
            aria-labelledby="dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onClose();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
        >
            <div className="dialog-inner">
                <div className="dialog-heading">
                    <h2 id="dialog-title">{title}</h2>
                    <button
                        className="icon-button"
                        aria-label="Close dialog"
                        disabled={busy}
                        onClick={onClose}
                    >
                        <Icon name="close" />
                    </button>
                </div>
                {children}
            </div>
        </dialog>
    );
}

export function AuthDialog({
    authenticated,
    onClose,
    onSession,
}: {
    authenticated: boolean;
    onClose: () => void;
    onSession: (data: SessionData) => void;
}) {
    const [mode, setMode] = useState<"login" | "register">("register");
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function submit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            onSession(await api.auth(mode, identifier.trim(), password));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }
    async function logout() {
        setBusy(true);
        setError("");
        try {
            onSession(await api.logout());
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog
            title={authenticated ? "Your account" : "Give your degree a home."}
            onClose={onClose}
            busy={busy}
        >
            {authenticated ? (
                <>
                    <p>
                        Your student record is saved to your account. Sign in on
                        another device to pick up here.
                    </p>
                    <p className="dialog-note">
                        Signing out returns to your separate guest record on
                        this browser.
                    </p>
                    {error && (
                        <p className="error-box" role="alert">
                            {error}
                        </p>
                    )}
                    <button
                        className="button secondary full-width"
                        disabled={busy}
                        onClick={logout}
                    >
                        {busy ? "Signing out…" : "Sign out"}
                    </button>
                </>
            ) : (
                <>
                    <p>
                        Create an account to save across devices and appear on
                        the scoreboard.
                    </p>
                    <div
                        className="auth-tabs"
                        aria-label="Choose account action"
                    >
                        <button
                            type="button"
                            className={mode === "register" ? "active" : ""}
                            aria-pressed={mode === "register"}
                            disabled={busy}
                            onClick={() => {
                                setMode("register");
                                setError("");
                            }}
                        >
                            Register
                        </button>
                        <button
                            type="button"
                            className={mode === "login" ? "active" : ""}
                            aria-pressed={mode === "login"}
                            disabled={busy}
                            onClick={() => {
                                setMode("login");
                                setError("");
                            }}
                        >
                            Log in
                        </button>
                    </div>
                    <form onSubmit={submit}>
                        <div className="field">
                            <label htmlFor="login-identifier">Username</label>
                            <input
                                id="login-identifier"
                                data-autofocus
                                autoComplete="username"
                                value={identifier}
                                onChange={(event) =>
                                    setIdentifier(event.target.value)
                                }
                                minLength={3}
                                maxLength={48}
                                pattern="[a-zA-Z0-9_.\-]+"
                                required
                                disabled={busy}
                                aria-describedby="username-help"
                            />
                            <small id="username-help">
                                3–48 letters, numbers, dots, dashes, or
                                underscores. Kept private.
                            </small>
                        </div>
                        <div className="field">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                autoComplete={
                                    mode === "register"
                                        ? "new-password"
                                        : "current-password"
                                }
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                                minLength={10}
                                maxLength={128}
                                required
                                disabled={busy}
                                aria-describedby="password-help"
                            />
                            <small id="password-help">10–128 characters.</small>
                        </div>
                        <p className="dialog-note">
                            {mode === "register"
                                ? "A new account starts a fresh student record."
                                : "Logging in loads your account’s saved student record."}{" "}
                            Guest progress stays in this browser and is never
                            uploaded to the scoreboard.
                        </p>
                        {error && (
                            <p className="error-box" role="alert">
                                {error}
                            </p>
                        )}
                        <button
                            className="button primary full-width"
                            disabled={busy}
                        >
                            {busy
                                ? "One moment…"
                                : mode === "register"
                                  ? "Create account"
                                  : "Log in"}{" "}
                            {!busy && <Icon name="arrow" size={18} />}
                        </button>
                    </form>
                </>
            )}
        </Dialog>
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
            <p>Big effort. Small bragging rights. Account records only.</p>
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
                        No student records yet. Register and create a character
                        to get listed.
                    </p>
                </div>
            ) : (
                <div className="table-scroll">
                    <table>
                        <caption className="sr-only">
                            Top 100 students, ordered by ECTS, then account
                            creation order
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
                none. Ties follow account creation order.
            </p>
        </Dialog>
    );
}
