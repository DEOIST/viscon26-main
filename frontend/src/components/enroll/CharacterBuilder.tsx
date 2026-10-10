// Source shell character creator with the destination's documented character fields.
import { useRef, type FormEvent } from "react";
import Avatar from "../common/Avatar";
import Icon from "../common/Icon";
import Swatches from "./Swatches";
import { COLORS } from "../../misc/shellConfig";
import type { Character } from "../../misc/CommonInt";
import { shellClass } from "../../misc/shellStyles";

interface CharacterBuilderArgs {
    character: Character;
    busy: boolean;
    error: string;
    onChange(character: Character): void;
    onContinue(): void;
}
export default function CharacterBuilder(args: CharacterBuilderArgs) {
    const nameInput = useRef<HTMLInputElement>(null);
    function handleChange<K extends keyof Character>(
        key: K,
        value: Character[K],
    ) {
        args.onChange({ ...args.character, [key]: value });
    }
    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!args.character.name.trim()) {
            nameInput.current?.focus();
            return;
        }
        args.onContinue();
    }
    return (
        <section className={shellClass("onboarding")}>
            <div className={shellClass("section-heading")}>
                <span className={shellClass("eyebrow")}>
                    01 / YOUR STUDENT RECORD
                </span>
                <h1>Meet your future self.</h1>
                <p>Same big plans. A slightly more organized haircut.</p>
            </div>
            <div className={shellClass("builder-layout")}>
                <div className={shellClass("character-preview panel")}>
                    <div className={shellClass("preview-top")}>
                        <span>STUDENT ID</span>
                        <span>{args.character.avatar.toUpperCase()}</span>
                    </div>
                    <div className={shellClass("portrait-frame")}>
                        <Avatar
                            character={args.character}
                            label={`Preview of ${args.character.name.trim() || "your student"}`}
                        />
                    </div>
                    <h2>{args.character.name.trim() || "Future legend"}</h2>
                    <p>D-INFK</p>
                    <span className={shellClass("badge neutral")}>
                        <Icon name="cap" size={15} />
                        Incoming student
                    </span>
                    <div className={shellClass("id-bottom")}>
                        <span>
                            VALID UNTIL YOU GRADUATE.
                            <br />
                            OPTIMISTIC, WE KNOW.
                        </span>
                    </div>
                </div>
                <form
                    className={shellClass("builder-form panel")}
                    onSubmit={handleSubmit}
                >
                    <fieldset disabled={args.busy}>
                        <legend className={shellClass("sr-only")}>
                            Your character
                        </legend>
                        <div className={shellClass("field")}>
                            <div className={shellClass("label-row")}>
                                <label htmlFor="character-name">
                                    Character name
                                </label>
                                <span>{args.character.name.length} / 20</span>
                            </div>
                            <input
                                ref={nameInput}
                                id="character-name"
                                autoComplete="nickname"
                                autoFocus
                                required
                                minLength={1}
                                maxLength={20}
                                value={args.character.name}
                                onChange={(event) =>
                                    handleChange("name", event.target.value)
                                }
                                aria-describedby="name-help"
                            />
                            <small id="name-help">
                                Letters, digits, spaces, dots, apostrophes,
                                underscores and dashes.
                            </small>
                        </div>
                        <div className={shellClass("field")}>
                            <label htmlFor="department">Department</label>
                            <select id="department" value="infk" disabled>
                                <option value="infk">D-INFK</option>
                            </select>
                        </div>
                        <Swatches
                            label="Hair color"
                            colors={COLORS.hair}
                            value={args.character.hairColor}
                            onChange={(value) =>
                                handleChange("hairColor", value)
                            }
                        />
                        <Swatches
                            label="Skin color"
                            colors={COLORS.skin}
                            value={args.character.skinColor}
                            onChange={(value) =>
                                handleChange("skinColor", value)
                            }
                        />
                        <Swatches
                            label="Eye color"
                            colors={COLORS.eyes}
                            value={args.character.eyeColor}
                            onChange={(value) =>
                                handleChange("eyeColor", value)
                            }
                        />
                    </fieldset>
                    {args.error && (
                        <p className={shellClass("error-box")} role="alert">
                            {args.error}
                        </p>
                    )}
                    <div className={shellClass("form-actions")}>
                        <a href="/" className={shellClass("button ghost")}>
                            <Icon name="back" />
                            Back
                        </a>
                        <button
                            className={shellClass("button primary")}
                            disabled={args.busy}
                        >
                            Continue
                            <Icon name="arrow" />
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
}
