import Layout from "../common/Layout";
import MinigamePage from "../common/MinigamePage";
import MissingRun from "../common/MissingRun";
import { mountBlackjack } from "../../games/blackjack";
import { readRunId } from "../../misc/run";

export default function App() {
    const runId = readRunId();

    return (
        <Layout title="Casino night" isWide>
            {runId ? (
                <MinigamePage
                    runId={runId}
                    game="blackjack"
                    title="Casino night"
                    instructions="You bet your semester stipend of 1 000 CHF at blackjack. Keep your money and you score 50; double it and you score 100."
                    mount={mountBlackjack}
                />
            ) : (
                <MissingRun />
            )}
        </Layout>
    );
}
