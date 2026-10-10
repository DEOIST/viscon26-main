import CvStatusNote from "./CvStatusNote";
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
                    instructions="Exam questions fly at you for 60 seconds. Make a finger gun: index finger out, thumb up. Aim with your fingertip and drop your thumb to shoot. Deadlines are worth more, coffee buys time."
                    introExtra={<CvStatusNote />}
                    mount={mountShooter}
                />
            ) : (
                <MissingRun />
            )}
        </Layout>
    );
}
