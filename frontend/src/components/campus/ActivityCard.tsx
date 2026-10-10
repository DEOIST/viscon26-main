import Icon from "../common/Icon";
import { runHref } from "../../misc/run";
import type { Run, ShellGame } from "../../misc/CommonInt";
import { shellClass } from "../../misc/shellStyles";

interface ActivityCardArgs {
    game: ShellGame;
    run: Run;
    index: number;
}
export default function ActivityCard(args: ActivityCardArgs) {
    const done = args.run.completedGameIds.includes(args.game.id);
    return (
        <section
            className={shellClass("year-card panel")}
            aria-labelledby={`game-${args.game.id}`}
        >
            <div className={shellClass("year-heading")}>
                <span
                    className={shellClass(
                        `year-number ${done ? "is-complete" : "is-available"}`,
                    )}
                >
                    {String(args.index + 1).padStart(2, "0")}
                </span>
                <div className={shellClass("year-title")}>
                    <div className={shellClass("year-title-line")}>
                        <h3 id={`game-${args.game.id}`}>{args.game.title}</h3>
                        <span
                            className={shellClass(
                                `badge ${done ? "success" : "neutral"}`,
                            )}
                        >
                            {done
                                ? "Completed"
                                : args.game.implemented
                                  ? "Available"
                                  : "Coming soon"}
                        </span>
                    </div>
                    <p>{args.game.description}</p>
                </div>
                <div className={shellClass("year-credits")}>
                    <strong>
                        {done ? args.game.ects : 0}
                        <span> / {args.game.ects}</span>
                    </strong>
                    <small>ECTS earned</small>
                </div>
            </div>
            <div className={shellClass("game-row")}>
                <Icon name={done ? "check" : "slot"} size={22} />
                <div className={shellClass("game-description")}>
                    <h4>{args.game.title}</h4>
                    <p>
                        {done
                            ? `Score: ${args.run.scores[args.game.id]} / 100`
                            : args.game.implemented
                              ? "Not completed"
                              : "Preview · no credits yet"}
                    </p>
                </div>
                <span className={shellClass("reward-label")}>
                    {args.game.ects} ECTS
                </span>
                <a
                    className={shellClass("button primary compact")}
                    href={runHref(`/${args.game.id}`, args.run.id)}
                >
                    {done
                        ? "Replay"
                        : args.game.implemented
                          ? "Open"
                          : "Preview"}
                    <Icon name="arrow" size={16} />
                </a>
            </div>
        </section>
    );
}
