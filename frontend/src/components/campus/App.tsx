import Campus from "./Campus";
import Layout from "../common/Layout";
import MissingRun from "../common/MissingRun";
import { readRunId } from "../../misc/run";

export default function App() {
    const runId = readRunId();

    return (
        <Layout title="Campus">
            {runId ? <Campus runId={runId} /> : <MissingRun />}
        </Layout>
    );
}
