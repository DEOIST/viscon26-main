import Icon from "../common/Icon";
import { TOTAL_ECTS } from "../../misc/shellConfig";
import { shellClass } from "../../misc/shellStyles";
interface WelcomeScreenArgs {
    onStart: () => void;
}
export default function WelcomeScreen(args: WelcomeScreenArgs) {
    const { onStart } = args;
    return (
        <>
            <div className={shellClass("welcome-layout")}>
                <section className={shellClass("welcome-copy")}>
                    <span className={shellClass("eyebrow")}>
                        <span className={shellClass("status-dot")} /> ADMISSIONS
                        OPEN Â· FREE TIME CLOSED
                    </span>
                    <h1>
                        ETH Simulator
                        <span className={shellClass("primary-text")}>.</span>
                    </h1>
                    <p className={shellClass("hero-lead")}>
                        Big ambitions.
                        <br />
                        Very little free time.
                    </p>
                    <p className={shellClass("hero-description")}>
                        Your unofficial university adventure. Create a student,
                        work your way through three years, and earn those very
                        expensive letters.
                    </p>
                    <button
                        className={shellClass("button primary large")}
                        onClick={onStart}
                    >
                        Start your degree <Icon name="arrow" />
                    </button>
                    <p className={shellClass("fine-print")}>
                        Create your character and play. Coffee not included.
                    </p>
                </section>
                <div className={shellClass("letter-scene")} aria-hidden="true">
                    <span className={shellClass("scene-corner top")}>
                        EST. AFTER HOURS
                    </span>
                    <div className={shellClass("admission-paper")}>
                        <div className={shellClass("paper-top")}>
                            <Icon name="cap" size={36} />
                            <span>
                                OFFICE OF
                                <br />
                                QUESTIONABLE DECISIONS
                            </span>
                        </div>
                        <div className={shellClass("paper-rule")} />
                        <span className={shellClass("paper-kicker")}>
                            YOUR NEXT CHAPTER
                        </span>
                        <h2>Youâ€™re in.</h2>
                        <p>
                            Dear future student,
                            <br />
                            <br />
                            We saw your potential.
                            <br />
                            Your sleep schedule saw
                            <br />
                            the writing on the wall.
                        </p>
                        <div className={shellClass("paper-signature")}>
                            See you on campus.
                        </div>
                        <span className={shellClass("paper-stamp")}>
                            <Icon name="check" size={19} /> ACCEPTED
                        </span>
                        <span className={shellClass("paper-note")}>
                            UNOFFICIAL. UNREASONABLY RELATABLE.
                        </span>
                    </div>
                    <div className={shellClass("ects-ticket")}>
                        <Icon name="cap" size={25} />
                        <span>
                            <strong>{TOTAL_ECTS} ECTS</strong>
                            <small>One ambitious plan</small>
                        </span>
                    </div>
                    <span className={shellClass("scene-corner bottom")}>
                        A STUDENT PARODY, WITH LOVE.
                    </span>
                </div>
            </div>
            <div
                className={shellClass("journey-strip")}
                aria-label="Your journey"
            >
                {[
                    [
                        "01",
                        "Make it your degree",
                        "Build a character. Pick your look.",
                    ],
                    [
                        "02",
                        "Take it one year at a time",
                        `Two challenges. ${TOTAL_ECTS} credits. Deep breaths.`,
                    ],
                    [
                        "03",
                        "Get the last word",
                        "Graduate. Finally update that bio.",
                    ],
                ].map(([number, title, description]) => (
                    <div className={shellClass("journey-item")} key={number}>
                        <span className={shellClass("step-number")}>
                            {number}
                        </span>
                        <div>
                            <strong>{title}</strong>
                            <p>{description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
