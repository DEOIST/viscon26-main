import Diploma from "./Diploma";
import MissingRun from "../common/MissingRun";
import { apiGraduateRun } from "../../misc/apiClient";
import { runHref } from "../../misc/run";
import { useApi } from "../../misc/useApi";
import styles from "./Graduation.module.css";

interface GraduationArgs {
    runId: string;
}

// Graduating is idempotent, so the page simply asks for it on every visit.
export default function Graduation(args: GraduationArgs) {
    const graduation = useApi(() => apiGraduateRun(args.runId), [args.runId]);

    if (graduation.status === 409)
        return (
            <p className={styles.notice}>
                {graduation.error}.{" "}
                <a href={runHref("/campus", args.runId)}>Back to campus</a>
            </p>
        );
    if (graduation.error !== null)
        return <MissingRun error={graduation.error} />;
    if (graduation.data?.ending == null)
        return (
            <p className={styles.notice}>The rector approaches the podium…</p>
        );
    return <Diploma run={graduation.data} />;
}
