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
                        gun: index finger out, thumb up. Aim with your fingertip
                        and drop your thumb to shoot. Deadlines are worth more,
                        coffee buys time.
                    </p>
                    <CvStatusNote />
                </>
            }
        />
    );
}
