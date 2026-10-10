import { useRef, useState, type FormEvent } from "react";
import {
    COLORS,
    DEPARTMENT,
    departmentLabel,
    TOTAL_ECTS,
    YEARS,
} from "../config";
import type { Character, Player } from "../types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
    return (
        <>
            <div className="welcome-layout">
                <section className="welcome-copy">
                    <span className="eyebrow">
                        <span className="status-dot" /> ADMISSIONS OPEN · FREE
                        TIME CLOSED
                    </span>
                    <h1>
                        ETH Simulator<span className="primary-text">.</span>
                    </h1>
                    <p className="hero-lead">
                        Big ambitions.
                        <br />
                        Very little free time.
                    </p>
                    <p className="hero-description">
                        Your unofficial university adventure. Create a student,
                        work your way through three years, and earn those very
                        expensive letters.
                    </p>
                    <button className="button primary large" onClick={onStart}>
                        Start your degree <Icon name="arrow" />
                    </button>
                    <p className="fine-print">
                        No account needed to start. Coffee not included.
                    </p>
                </section>
                <div className="letter-scene" aria-hidden="true">
                    <span className="scene-corner top">EST. AFTER HOURS</span>
                    <div className="admission-paper">
                        <div className="paper-top">
                            <Icon name="cap" size={36} />
                            <span>
                                OFFICE OF
                                <br />
                                QUESTIONABLE DECISIONS
                            </span>
                        </div>
                        <div className="paper-rule" />
                        <span className="paper-kicker">YOUR NEXT CHAPTER</span>
                        <h2>You’re in.</h2>
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
                        <div className="paper-signature">
                            See you on campus.
                        </div>
                        <span className="paper-stamp">
                            <Icon name="check" size={19} /> ACCEPTED
                        </span>
                        <span className="paper-note">
                            UNOFFICIAL. UNREASONABLY RELATABLE.
                        </span>
                    </div>
                    <div className="ects-ticket">
                        <Icon name="cap" size={25} />
                        <span>
                            <strong>{TOTAL_ECTS} ECTS</strong>
                            <small>One ambitious plan</small>
                        </span>
                    </div>
                    <span className="scene-corner bottom">
                        A STUDENT PARODY, WITH LOVE.
                    </span>
                </div>
            </div>
            <div className="journey-strip" aria-label="Your journey">
                {[
                    [
                        "01",
                        "Make it your degree",
                        "Build a character. Pick your look.",
                    ],
                    [
                        "02",
                        "Take it one year at a time",
                        `${YEARS.length} years. ${TOTAL_ECTS} credits. Deep breaths.`,
                    ],
                    [
                        "03",
                        "Get the last word",
                        "Graduate. Finally update that bio.",
                    ],
                ].map(([number, title, description]) => (
                    <div className="journey-item" key={number}>
                        <span className="step-number">{number}</span>
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

function Swatches({
    label,
    value,
    colors,
    onChange,
}: {
    label: string;
    value: string;
    colors: { label: string; value: string }[];
    onChange: (value: string) => void;
}) {
    return (
        <fieldset className="swatches">
            <legend>
                {label}{" "}
                <span>
                    {colors.find((color) => color.value === value)?.label}
                </span>
            </legend>
            <div className="swatch-options">
                {colors.map((color) => (
                    <button
                        type="button"
                        className={`swatch ${value === color.value ? "selected" : ""}`}
                        key={color.value}
                        aria-label={`${label}: ${color.label}`}
                        aria-pressed={value === color.value}
                        title={color.label}
                        onClick={() => onChange(color.value)}
                    >
                        <span
                            className="swatch-color"
                            style={{ backgroundColor: color.value }}
                        />
                        {value === color.value && (
                            <span className="swatch-check">
                                <Icon name="check" size={12} />
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </fieldset>
    );
}

export function CharacterBuilder({
    player,
    busy,
    error,
    onBack,
    onContinue,
}: {
    player: Player;
    busy: boolean;
    error: string;
    onBack: (draft: Player) => void;
    onContinue: (draft: Player) => void;
}) {
    const [name, setName] = useState(player.name);
    const [character, setCharacter] = useState(player.character);
    const [validation, setValidation] = useState("");
    const nameInput = useRef<HTMLInputElement>(null);
    const draft = { ...player, name: name.trim(), character };
    const choose = (key: keyof Character, color: string) =>
        setCharacter((current) => ({ ...current, [key]: color }));
    function submit(event: FormEvent) {
        event.preventDefault();
        if (!name.trim()) {
            setValidation(
                "Your student needs a name. Even the paperwork agrees.",
            );
            nameInput.current?.focus();
            return;
        }
        setValidation("");
        onContinue({ ...draft, onboardingStage: "acceptance" });
    }
    return (
        <section className="onboarding">
            <div className="section-heading">
                <span className="eyebrow">01 / YOUR STUDENT RECORD</span>
                <h1>Meet your future self.</h1>
                <p>Same big plans. A slightly more organized haircut.</p>
            </div>
            <div className="builder-layout">
                <div className="character-preview panel">
                    <div className="preview-top">
                        <span>STUDENT ID</span>
                        <span>CS / 001</span>
                    </div>
                    <div className="portrait-frame">
                        <Avatar
                            character={character}
                            label={`Preview of ${name.trim() || "your student"}`}
                        />
                    </div>
                    <h2>{name.trim() || "Future legend"}</h2>
                    <p>{DEPARTMENT}</p>
                    <span className="badge neutral">
                        <Icon name="cap" size={15} /> Incoming student
                    </span>
                    <div className="id-bottom">
                        <svg
                            className="barcode"
                            viewBox="0 0 79 26"
                            aria-hidden="true"
                        >
                            {[
                                0, 4, 9, 12, 18, 23, 26, 32, 36, 42, 47, 51, 56,
                                62, 67, 72, 77,
                            ].map((x, i) => (
                                <rect
                                    key={x}
                                    x={x}
                                    y="0"
                                    width={i % 3 === 0 ? 3 : 1}
                                    height="26"
                                    fill="currentColor"
                                />
                            ))}
                        </svg>
                        <span>
                            VALID UNTIL YOU GRADUATE.
                            <br />
                            OPTIMISTIC, WE KNOW.
                        </span>
                    </div>
                </div>
                <form className="builder-form panel" onSubmit={submit}>
                    <div className="field">
                        <div className="label-row">
                            <label htmlFor="character-name">
                                Character name
                            </label>
                            <span>{name.length} / 24</span>
                        </div>
                        <input
                            ref={nameInput}
                            id="character-name"
                            autoComplete="nickname"
                            autoFocus
                            maxLength={24}
                            value={name}
                            placeholder="What should we call you?"
                            aria-invalid={!!validation}
                            aria-describedby="name-help"
                            disabled={busy}
                            onChange={(event) => {
                                setName(event.target.value);
                                setValidation("");
                            }}
                        />
                        <small
                            id="name-help"
                            className={validation ? "error-text" : ""}
                        >
                            {validation ||
                                "This name appears on your student record and the scoreboard."}
                        </small>
                    </div>
                    <fieldset className="appearance-fields" disabled={busy}>
                        <legend className="sr-only">
                            Character appearance
                        </legend>
                        <Swatches
                            label="Hair color"
                            colors={COLORS.hair}
                            value={character.hairColor}
                            onChange={(color) => choose("hairColor", color)}
                        />
                        <Swatches
                            label="Skin color"
                            colors={COLORS.skin}
                            value={character.skinColor}
                            onChange={(color) => choose("skinColor", color)}
                        />
                        <Swatches
                            label="Eye color"
                            colors={COLORS.eyes}
                            value={character.eyeColor}
                            onChange={(color) => choose("eyeColor", color)}
                        />
                    </fieldset>
                    <div className="field">
                        <label htmlFor="major">Department</label>
                        <select id="major" value={DEPARTMENT} disabled>
                            <option value={DEPARTMENT}>{DEPARTMENT}</option>
                        </select>
                        <small>
                            One department. Plenty of existential questions.
                        </small>
                    </div>
                    {error && (
                        <p role="alert" className="error-box">
                            {error}
                        </p>
                    )}
                    <div className="form-actions">
                        <button
                            type="button"
                            className="button ghost"
                            disabled={busy}
                            onClick={() => onBack(draft)}
                        >
                            <Icon name="back" /> Back
                        </button>
                        <button className="button primary" disabled={busy}>
                            {busy ? "Saving…" : "Continue"}{" "}
                            <Icon name="arrow" />
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
}

export function AcceptanceScreen({
    player,
    busy,
    error,
    onBegin,
    onBack,
}: {
    player: Player;
    busy: boolean;
    error: string;
    onBegin: () => void;
    onBack: () => void;
}) {
    return (
        <section className="story-wrap">
            <span className="eyebrow">02 / A VERY IMPORTANT LETTER</span>
            <div className="story-card panel">
                <div className="story-header">
                    <Icon name="cap" size={32} />
                    <span>
                        THE UNOFFICIAL
                        <br />
                        ADMISSIONS OFFICE
                    </span>
                    <span className="badge success">
                        <Icon name="check" size={15} /> Accepted
                    </span>
                </div>
                <div className="story-body">
                    <Avatar
                        character={player.character}
                        className="story-avatar"
                    />
                    <p className="eyebrow">DEAR {player.name.toUpperCase()},</p>
                    <h1>
                        Welcome to the
                        <br />
                        next three years.
                    </h1>
                    <p>
                        Congratulations, <strong>{player.name}</strong>! You
                        have been accepted into{" "}
                        <strong>{departmentLabel(player.major)}</strong>.
                    </p>
                    <p>
                        Your potential is impressive. Your free time has been
                        successfully unenrolled.
                    </p>
                    <p className="story-signoff">
                        Warm regards,
                        <br />
                        <strong>The unofficial admissions team</strong>
                    </p>
                </div>
                <div className="story-footer">
                    <span>
                        {YEARS.length} years <span aria-hidden="true">/</span>{" "}
                        {TOTAL_ECTS} ECTS <span aria-hidden="true">/</span>{" "}
                        You’ve got this.
                    </span>
                </div>
            </div>
            {error && (
                <p className="error-box" role="alert">
                    {error}
                </p>
            )}
            <div className="story-actions">
                <button
                    className="button ghost"
                    onClick={onBack}
                    disabled={busy}
                >
                    <Icon name="back" /> Edit character
                </button>
                <button
                    className="button primary large"
                    onClick={onBegin}
                    disabled={busy}
                >
                    {busy ? "Saving…" : "Begin Year 1"} <Icon name="arrow" />
                </button>
            </div>
        </section>
    );
}

export function GraduationScreen({
    player,
    ects,
    onReturn,
}: {
    player: Player;
    ects: number;
    onReturn: () => void;
}) {
    return (
        <section className="graduation panel">
            <span className="eyebrow reward-text">DEGREE COMPLETE</span>
            <div className="graduate-portrait">
                <Avatar character={player.character} />
                <span className="graduate-seal">
                    <Icon name="cap" size={32} />
                </span>
            </div>
            <h1>You did it, {player.name}.</h1>
            <p className="hero-lead">
                Officially done. Unofficially legendary.
            </p>
            <p>
                {departmentLabel(player.major)}{" "}
                <span aria-hidden="true">·</span>{" "}
                <strong className="reward-text">{ects} ECTS earned</strong>
            </p>
            <p className="graduation-copy">
                Congratulations. You may now close those 47 browser tabs.
                <br />
                Your degree and progress are staying right here.
            </p>
            <button className="button primary" onClick={onReturn}>
                <Icon name="back" /> Return to overview
            </button>
        </section>
    );
}
