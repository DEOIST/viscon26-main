// How to play Galton Blackjack (frontend/level2/), shown before the Year 2 round starts.
// The screenshots are cropped from the real game; recapture them if the table art changes.
import betUrl from "../assets/howto/blackjack-bet.webp";
import curveUrl from "../assets/howto/blackjack-curve.webp";
import dropUrl from "../assets/howto/blackjack-drop.webp";
import { TEXT } from "../misc/text";
import styles from "./BlackjackHowTo.module.css";

const T = TEXT.workspace.blackjackHowTo;

// Wording: workspace.blackjackHowTo in shared/text.json, one entry per screenshot.
const IMAGES = [betUrl, dropUrl, curveUrl];
const STEPS = T.steps.map((step, i) => ({ ...step, image: IMAGES[i] }));

export default function BlackjackHowTo() {
    return (
        <section className={styles.howTo} aria-labelledby="blackjack-how-to">
            <h3 id="blackjack-how-to" className={styles.title}>
                {T.title}
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
