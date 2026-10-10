// How to play Galton Blackjack (frontend/level2/), shown before the Year 2 round starts.
// The screenshots are cropped from the real game; recapture them if the table art changes.
import betUrl from "../assets/howto/blackjack-bet.webp";
import curveUrl from "../assets/howto/blackjack-curve.webp";
import dropUrl from "../assets/howto/blackjack-drop.webp";
import styles from "./BlackjackHowTo.module.css";

const STEPS = [
    {
        title: "Bet",
        text: "Stack chips from your 1 000 stipend and press Deal, ten hands to grow it.",
        image: betUrl,
        alt: "Chips on the bet pile next to the Deal button",
    },
    {
        title: "Drop",
        text: "Every card turns its suit symbols into balls that bounce down your Galton board.",
        image: dropUrl,
        alt: "Balls bouncing through the pins of a Galton board",
    },
    {
        title: "Beat the curve",
        text: "Hit or stand to end with more balls than the dealer, but a red ball above the curve busts and three yellow on it is blackjack.",
        image: curveUrl,
        alt: "A board with green, yellow and red balls stacked under a bell curve",
    },
];

export default function BlackjackHowTo() {
    return (
        <section className={styles.howTo} aria-labelledby="blackjack-how-to">
            <h3 id="blackjack-how-to" className={styles.title}>
                How to play
            </h3>
            <ol className={styles.steps}>
                {STEPS.map((step, index) => (
                    <li key={step.title} className={styles.step}>
                        <figure className={styles.shot}>
                            <img src={step.image} alt={step.alt} />
                            <span className={styles.number} aria-hidden="true">
                                {index + 1}
                            </span>
                        </figure>
                        <h4>{step.title}</h4>
                        <p>{step.text}</p>
                    </li>
                ))}
            </ol>
        </section>
    );
}
