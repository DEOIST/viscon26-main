import { useEffect, useRef } from "react";
import type { ActivitySummary } from "../api";
import {
    activityLevel,
    buildWeeks,
    formatActivityDay,
    monthLabel,
} from "../activity";
import styles from "./ActivityGraph.module.css";

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function roundsText(attempts: number): string {
    return attempts === 1 ? "1 round" : `${attempts} rounds`;
}

interface ActivityGraphArgs {
    summary: ActivitySummary;
}

export default function ActivityGraph(args: ActivityGraphArgs) {
    const scroller = useRef<HTMLDivElement>(null);
    const weeks = buildWeeks(args.summary.today, args.summary.days);
    const yearTotal = args.summary.days.reduce(
        (sum, entry) => sum + entry.attempts,
        0,
    );

    // On narrow screens the graph scrolls sideways; start on the most recent weeks. Wait a frame:
    // this effect runs before the surrounding <dialog> opens, when nothing has a width yet.
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const element = scroller.current;
            if (element) element.scrollLeft = element.scrollWidth;
        });
        return () => cancelAnimationFrame(frame);
    }, [args.summary]);

    return (
        <figure className={styles.graph}>
            <div className={styles.scroller} ref={scroller}>
                <div
                    className={styles.grid}
                    role="img"
                    aria-label={`${roundsText(yearTotal)} on ${args.summary.days.length} days in the last year`}
                >
                    <div className={styles.weekdays} aria-hidden="true">
                        <span className={styles.month} />
                        {WEEKDAY_LABELS.map((label, index) => (
                            <span key={index}>{label}</span>
                        ))}
                    </div>
                    {weeks.map((week, index) => (
                        <div className={styles.week} key={week[0].day}>
                            <span className={styles.month} aria-hidden="true">
                                {monthLabel(weeks, index)}
                            </span>
                            {week.map((cell) =>
                                cell.future ? (
                                    <span
                                        key={cell.day}
                                        className={styles.empty}
                                    />
                                ) : (
                                    <span
                                        key={cell.day}
                                        className={styles.cell}
                                        data-level={activityLevel(
                                            cell.attempts,
                                        )}
                                        title={`${cell.attempts ? roundsText(cell.attempts) : "No rounds"} on ${formatActivityDay(cell.day)}`}
                                    />
                                ),
                            )}
                        </div>
                    ))}
                </div>
            </div>
            <figcaption className={styles.legend}>
                <span>{roundsText(yearTotal)} in the last year</span>
                <span className={styles.scale} aria-hidden="true">
                    Less
                    {[0, 1, 2, 3, 4].map((level) => (
                        <span
                            key={level}
                            className={styles.cell}
                            data-level={level}
                        />
                    ))}
                    More
                </span>
            </figcaption>
        </figure>
    );
}
