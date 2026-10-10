import CvStatusNote from "./CvStatusNote";
import MinigamePage from "../common/MinigamePage";

export default function App() {
    return (
        <MinigamePage
            gameId="shooter"
            introExtra={
                <>
                    <p>
                        Exam questions fly at you for 60 seconds. Make a finger
                        gun: index finger at the screen, thumb up. Hold it still
                        at the centre for a moment, then move your hand to aim
                        and drop your thumb clearly to shoot. Deadlines are
                        worth more, coffee buys time. C recentres the aim.
                    </p>
                    <CvStatusNote />
                </>
            }
        />
    );
}
