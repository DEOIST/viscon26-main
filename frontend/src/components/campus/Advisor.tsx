import { apiGenerateDialogue } from "../../misc/apiClient";
import { useApi } from "../../misc/useApi";
import { shellClass } from "../../misc/shellStyles";
import styles from "./Advisor.module.css";

interface AdvisorArgs {
    runId: string;
}

export default function Advisor(args: AdvisorArgs) {
    const dialogue = useApi(
        () => apiGenerateDialogue(args.runId, { scene: "campus" }),
        [args.runId],
    );
    return (
        <section
            className={`${shellClass("panel")} ${styles.advisor}`}
            aria-label="Study advisor"
        >
            {dialogue.loading && <p>Dr. Gradient is coming…</p>}
            {dialogue.data?.lines.advisor?.map((line) => (
                <p key={line}>{line}</p>
            ))}
        </section>
    );
}
