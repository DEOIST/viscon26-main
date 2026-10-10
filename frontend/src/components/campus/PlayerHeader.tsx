import Avatar from "../common/Avatar";
import { DEPARTMENTS } from "../../misc/character";
import { TOTAL_ECTS } from "../../misc/shellConfig";
import type { Run } from "../../misc/CommonInt";
import { shellClass } from "../../misc/shellStyles";

interface PlayerHeaderArgs {
    run: Run;
}
export default function PlayerHeader(args: PlayerHeaderArgs) {
    return (
        <section
            className={shellClass("player-header panel")}
            aria-label="Your student progress"
        >
            <div className={shellClass("player-summary")}>
                <div className={shellClass("small-portrait")}>
                    <Avatar character={args.run.character} />
                </div>
                <div>
                    <span className={shellClass("eyebrow")}>
                        YOUR STUDENT RECORD
                    </span>
                    <h1>{args.run.character.name}</h1>
                    <p>{DEPARTMENTS[args.run.character.department]}</p>
                </div>
            </div>
            <span className={shellClass("badge neutral")}>
                {args.run.completedGameIds.length === 2
                    ? "Graduation day"
                    : `Semester ${args.run.completedGameIds.length + 1}`}
            </span>
            <div className={shellClass("degree-progress")}>
                <div className={shellClass("label-row")}>
                    <span>Degree progress</span>
                    <span>
                        <strong>{args.run.ectsPoints}</strong> / {TOTAL_ECTS}{" "}
                        ECTS
                    </span>
                </div>
                <progress
                    value={args.run.ectsPoints}
                    max={TOTAL_ECTS}
                    aria-label="Degree ECTS earned"
                >
                    {args.run.ectsPoints} / {TOTAL_ECTS} ECTS
                </progress>
            </div>
        </section>
    );
}
