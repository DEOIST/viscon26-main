import Layout from "../common/Layout";
import MinigamePage from "../common/MinigamePage";
import MissingRun from "../common/MissingRun";
import { mountShooter } from "../../games/shooter";
import { readRunId } from "../../misc/run";

export default function App() {
    const runId = readRunId();

    return (
        <Layout title="Basisprüfung" isWide>
            {runId ? (
                <MinigamePage
                    runId={runId}
                    game="shooter"
                    title="Basisprüfung"
                    instructions="Exam questions are coming for you. Make a finger gun, aim with your index finger and drop your thumb to shoot. (For now: click the targets with the mouse.)"
                    mount={mountShooter}
                />
            ) : (
                <MissingRun />
            )}
        </Layout>
    );
}
