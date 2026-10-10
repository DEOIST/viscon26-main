import ShellLayout from "../common/ShellLayout";
import RunStatus from "../common/RunStatus";
import Graduation from "./Graduation";
import { useRun } from "../../misc/useRun";

export default function App() {
    const result = useRun(true);
    return (
        <ShellLayout title="Graduation">
            <RunStatus
                loading={result.loading}
                error={result.error}
                onRetry={result.reload}
            >
                {result.data && <Graduation initialRun={result.data} />}
            </RunStatus>
        </ShellLayout>
    );
}
