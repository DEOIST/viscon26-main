// The ending reveal: one certificate per career tier. The server decides the ending from the
// minigame average (services/endings.py); this file only dresses it up.

import Avatar from "../common/Avatar";
import { DEPARTMENTS } from "../../misc/character";
import { GAMES } from "../../misc/shellConfig";
import type { Ending, EndingId, Run } from "../../misc/CommonInt";
import quantUrl from "../../assets/endings/quant.jpg";
import phdUrl from "../../assets/endings/phd.jpg";
import mastersUrl from "../../assets/endings/masters.jpg";
import mcdonaldsUrl from "../../assets/endings/mcdonalds.jpeg";
import homelessUrl from "../../assets/endings/homeless.jpg";
import styles from "./Diploma.module.css";

interface EndingArt {
    image: string;
    alt: string;
    // object-position keeping the joke in frame when the photo is cropped
    focus: string;
    stamp: string;
    caption: string;
    salary: string;
    housing: string;
}

const ENDING_ART: Record<EndingId, EndingArt> = {
    quant: {
        image: quantUrl,
        alt: "A researcher filling a giant blackboard with formulas",
        focus: "50% 50%",
        stamp: "Summa cum laude",
        caption:
            "Turns out counting cards at casino night was a transferable skill.",
        salary: "CHF 400k + a bonus nobody can explain",
        housing: "Penthouse in Zug, tax-optimised",
    },
    phd: {
        image: phdUrl,
        alt: "A grinning graduate wearing a doctoral hat built from pizza boxes",
        focus: "50% 0%",
        stamp: "Magna cum laude",
        caption:
            "Your doctoral hat is 80 % pizza box. Your thesis is 80 % done. Since 2029.",
        salary: "CHF 47k and unlimited Mensa coffee",
        housing: "Your office desk, after 22:00",
    },
    masters: {
        image: mastersUrl,
        alt: "Two students walking down the steps of the ETH main building",
        focus: "50% 65%",
        stamp: "Cum laude",
        caption:
            "You left the main building for 4 minutes, then enrolled for a Master's.",
        salary: "Negative (semester fees)",
        housing: "Same WG, same broken dishwasher",
    },
    mcdonalds: {
        image: mcdonaldsUrl,
        alt: "A cat in a fast-food uniform and headset serving a burger",
        focus: "50% 25%",
        stamp: "Cum fries",
        caption:
            "Your new manager is a cat. It is still more organised than your study group.",
        salary: "CHF 24/h + all the fries you can carry",
        housing: "Staff room at Zürich HB",
    },
    homeless: {
        image: homelessUrl,
        alt: "A person crouching against a wall, holding up a cardboard sign that says HELP",
        focus: "50% 50%",
        stamp: "Sine domo",
        caption:
            "400 flat applications, zero viewings. The cardboard CV is getting traction.",
        salary: "Exposure",
        housing: "Waiting list position 4,127",
    },
};

interface DiplomaArgs {
    run: Run;
    ending: Ending;
    epilogue: string | null;
    audioUrl: string | null;
    sameFatePercent: number | null;
}

export default function Diploma(args: DiplomaArgs) {
    const art = ENDING_ART[args.ending.id];
    const character = args.run.character;
    return (
        <article className={styles.diploma} aria-label="Your diploma">
            <p className={styles.brand}>
                ETH Life · Diploma of determined survival
            </p>
            <p className={styles.certifies}>
                This certifies that <strong>{character.name}</strong> of{" "}
                {DEPARTMENTS[character.department]} survived{" "}
                {args.run.ectsPoints} ECTS and is hereby sentenced to a career
                as
            </p>
            <h2 className={styles.career}>{args.ending.title}</h2>
            <figure className={styles.photo}>
                <div className={styles.frame}>
                    <img
                        src={art.image}
                        alt={art.alt}
                        style={{ objectPosition: art.focus }}
                    />
                    <span className={styles.stamp}>{art.stamp}</span>
                    <div className={styles.avatarBadge}>
                        <Avatar
                            character={character}
                            label={`Graduate ${character.name}`}
                        />
                    </div>
                </div>
                <figcaption>{art.caption}</figcaption>
            </figure>
            <dl className={styles.records}>
                <div>
                    <dt>Starting salary</dt>
                    <dd>{art.salary}</dd>
                </div>
                <div>
                    <dt>Housing</dt>
                    <dd>{art.housing}</dd>
                </div>
                {GAMES.map((game) => (
                    <div key={game.id}>
                        <dt>{game.title}</dt>
                        <dd>{args.run.scores[game.id]} / 100</dd>
                    </div>
                ))}
                <div className={styles.total}>
                    <dt>Final average</dt>
                    <dd>{args.run.totalScore} / 100</dd>
                </div>
            </dl>
            {args.epilogue && (
                <p className={styles.epilogue}>{args.epilogue}</p>
            )}
            {args.audioUrl && <audio src={args.audioUrl} autoPlay controls />}
            {args.sameFatePercent !== null && (
                <p className={styles.fate}>
                    {args.sameFatePercent} % of graduates share your fate.
                </p>
            )}
            <p className={styles.unofficial}>
                Unofficial game diploma. Not affiliated with ETH Zürich, not an
                academic qualification, not accepted by your landlord.
            </p>
        </article>
    );
}
