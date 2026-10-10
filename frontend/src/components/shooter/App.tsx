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
                    instructions="Exam questions fly at you for 60 seconds. Make a finger gun: index finger at the screen, thumb up. Hold it still at the centre for a moment, then move your hand to aim and drop your thumb clearly to shoot. Deadlines are worth more, coffee buys time. C recentres the aim."
                    introExtra={<CvStatusNote />}
                    mount={mountShooter}
                />
            ) : (
                <MissingRun />
            )}
        </Layout>
    );
}
