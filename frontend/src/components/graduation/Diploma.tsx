// The ending reveal: one certificate per career tier. The server decides the ending from the
// minigame average (services/endings.py); this file only dresses it up.

import Avatar from "../common/Avatar";
import EndingPhoto from "../common/EndingPhoto";
import { DEPARTMENTS } from "../../misc/character";
import { GAMES } from "../../misc/shellConfig";
import { ENDING_ART } from "../../misc/endingArt";
import type { Ending, Run } from "../../misc/CommonInt";
import styles from "./Diploma.module.css";

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
            <EndingPhoto
                ending={args.ending.id}
                avatar={
                    <Avatar
                        character={character}
                        label={`Graduate ${character.name}`}
                    />
                }
            />
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
