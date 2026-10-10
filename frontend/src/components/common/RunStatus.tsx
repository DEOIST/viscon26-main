import type { ReactNode } from "react";
import { shellClass } from "../../misc/shellStyles";

interface RunStatusArgs {
    loading: boolean;
    error: string | null;
    onRetry(): void;
    children: ReactNode;
}
export default function RunStatus(args: RunStatusArgs) {
    if (args.loading)
        return (
            <div className={shellClass("loading-screen")} role="status">
                Finding your student record…
            </div>
        );
    if (args.error)
        return (
            <div className={shellClass("connection-panel panel")}>
                <h1>The admissions office is offline.</h1>
                <p role="alert">{args.error}</p>
                <button
                    className={shellClass("button secondary")}
                    onClick={args.onRetry}
                >
                    Try again
                </button>
            </div>
        );
    return args.children;
}
