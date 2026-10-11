// How to play each year's game, in three steps, shown on the launch panel before a round.
// The screenshots are cropped from the real games: recapture them when a game's look changes.
// The wording is workspace.howToPlay in shared/text.json; numbers come from the games' configs.
import { ROUND_SECONDS } from "../../level1/config";
import { BLACKJACK_YELLOWS, HANDS, START_CHIPS } from "../../level2/config";
import { EUREKA_DURATION_MS } from "../../level3/config";
import betUrl from "../assets/howto/blackjack-bet.webp";
import curveUrl from "../assets/howto/blackjack-curve.webp";
import dropUrl from "../assets/howto/blackjack-drop.webp";
import bugUrl from "../assets/howto/bugbash-bug.webp";
import fuseUrl from "../assets/howto/bugbash-fuse.webp";
import visitorUrl from "../assets/howto/bugbash-visitor.webp";
import eurekaUrl from "../assets/howto/thesis-eureka.webp";
import lanesUrl from "../assets/howto/thesis-lanes.webp";
import verdictUrl from "../assets/howto/thesis-verdict.webp";
import { fill, TEXT } from "../misc/text";
import styles from "./HowToPlay.module.css";

const T = TEXT.workspace.howToPlay;

// Year slots (shared/game-config.json) to their game's steps, one screenshot per step.
const GUIDES: Record<
    string,
    {
        steps: typeof T.bugBash;
        images: string[];
        values: Record<string, number>;
    }
> = {
    "year-1-slot": {
        steps: T.bugBash,
        images: [bugUrl, fuseUrl, visitorUrl],
        values: { seconds: ROUND_SECONDS },
    },
    "year-2-slot": {
        steps: T.blackjack,
        images: [betUrl, dropUrl, curveUrl],
        values: {
            chips: START_CHIPS,
            hands: HANDS,
            yellows: BLACKJACK_YELLOWS,
        },
    },
    "year-3-slot": {
        steps: T.thesis,
        images: [lanesUrl, eurekaUrl, verdictUrl],
        values: { seconds: EUREKA_DURATION_MS / 1000 },
    },
};

export const hasHowToPlay = (gameId: string) => gameId in GUIDES;

interface HowToPlayArgs {
    gameId: string;
}

export default function HowToPlay(args: HowToPlayArgs) {
    const guide = GUIDES[args.gameId];
    if (!guide) return null;
    const titleId = `how-to-play-${args.gameId}`;
    return (
        <section className={styles.howTo} aria-labelledby={titleId}>
            <h3 id={titleId} className={styles.title}>
                {T.title}
            </h3>
            <ol className={styles.steps}>
                {guide.steps.map((step, index) => (
                    <li key={step.title} className={styles.step}>
                        <figure className={styles.shot}>
                            <img src={guide.images[index]} alt={step.alt} />
                            <span className={styles.number} aria-hidden="true">
                                {index + 1}
                            </span>
                        </figure>
                        <h4>{step.title}</h4>
                        <p>{fill(step.text, guide.values)}</p>
                    </li>
                ))}
            </ol>
        </section>
    );
}
