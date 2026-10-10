import Avatar from "../common/Avatar";
import Icon from "../common/Icon";
import { DEPARTMENTS } from "../../misc/character";
import { TOTAL_ECTS } from "../../misc/shellConfig";
import type { Character } from "../../misc/CommonInt";
import { shellClass } from "../../misc/shellStyles";

interface AcceptanceScreenArgs {
    character: Character;
    busy: boolean;
    error: string;
    onBegin(): void;
    onBack(): void;
}
export default function AcceptanceScreen(args: AcceptanceScreenArgs) {
    return (
        <section className={shellClass("story-wrap")}>
            <span className={shellClass("eyebrow")}>
                02 / A VERY IMPORTANT LETTER
            </span>
            <div className={shellClass("story-card panel")}>
                <div className={shellClass("story-header")}>
                    <Icon name="cap" size={32} />
                    <span>
                        THE UNOFFICIAL
                        <br />
                        ADMISSIONS OFFICE
                    </span>
                    <span className={shellClass("badge success")}>
                        <Icon name="check" size={15} />
                        Accepted
                    </span>
                </div>
                <div className={shellClass("story-body")}>
                    <Avatar
                        character={args.character}
                        className="story-avatar"
                    />
                    <p className={shellClass("eyebrow")}>
                        DEAR {args.character.name.toUpperCase()},
                    </p>
                    <h1>
                        Welcome to the
                        <br />
                        next three years.
                    </h1>
                    <p>
                        Congratulations, <strong>{args.character.name}</strong>!
                        You have been accepted into{" "}
                        <strong>
                            {DEPARTMENTS[args.character.department]}
                        </strong>
                        .
                    </p>
                    <p>
                        Your potential is impressive. Your free time has been
                        successfully unenrolled.
                    </p>
                    <p className={shellClass("story-signoff")}>
                        Warm regards,
                        <br />
                        <strong>The unofficial admissions team</strong>
                    </p>
                </div>
                <div className={shellClass("story-footer")}>
                    Two challenges / {TOTAL_ECTS} ECTS / You’ve got this.
                </div>
            </div>
            {args.error && (
                <p className={shellClass("error-box")} role="alert">
                    {args.error}
                </p>
            )}
            <div className={shellClass("story-actions")}>
                <button
                    className={shellClass("button ghost")}
                    disabled={args.busy}
                    onClick={args.onBack}
                >
                    <Icon name="back" />
                    Edit character
                </button>
                <button
                    className={shellClass("button primary large")}
                    disabled={args.busy}
                    onClick={args.onBegin}
                >
                    {args.busy ? "Saving…" : "Begin your degree"}
                    <Icon name="arrow" />
                </button>
            </div>
        </section>
    );
}
