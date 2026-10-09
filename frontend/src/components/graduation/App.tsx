import Graduation from "./Graduation";
import Layout from "../common/Layout";
import MissingRun from "../common/MissingRun";
import { readRunId } from "../../misc/run";

export default function App() {
    const runId = readRunId();

    return (
        <Layout title="Graduation">
            {runId ? <Graduation runId={runId} /> : <MissingRun />}
        </Layout>
    );
}
