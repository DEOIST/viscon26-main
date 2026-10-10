import { useRef, useState, type FormEvent } from "react";
import {
    COLORS,
    DEPARTMENT,
    departmentLabel,
    endingFor,
    TOTAL_ECTS,
    YEARS,
} from "../config";
import type { Character, Gender, Glasses, HairLength, Player } from "../types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { PhotoAvatar } from "./PhotoAvatar";
import AdmissionLetter from "./AdmissionLetter";
import Diploma from "./Diploma";
import { MultiLine } from "./MultiLine";
import { ADMISSION_PHASES, type AdmissionPhase } from "../misc/admission";
import { fill, TEXT } from "../misc/text";
import diplomaStyles from "./Diploma.module.css";

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
    const text = TEXT.welcome;
    return (
        <>
            <div className="welcome-layout">
                <section className="welcome-copy">
                    <span className="eyebrow">
                        <span className="status-dot" /> {text.eyebrow}
                    </span>
                    <h1>
                        {text.title}
                        <span className="primary-text">.</span>
                    </h1>
                    <p className="hero-lead">
                        <MultiLine text={text.lead} />
                    </p>
                    <p className="hero-description">{text.description}</p>
                    <button className="button primary large" onClick={onStart}>
                        {text.start} <Icon name="arrow" />
                    </button>
                    <p className="fine-print">{text.finePrint}</p>
                </section>
                <div className="letter-scene" aria-hidden="true">
                    <span className="scene-corner top">
                        {text.letter.cornerTop}
                    </span>
                    <div className="admission-paper">
                        <div className="paper-top">
                            <Icon name="cap" size={36} />
                            <span>
                                <MultiLine text={text.letter.office} />
                            </span>
                        </div>
                        <div className="paper-rule" />
                        <span className="paper-kicker">
                            {text.letter.kicker}
                        </span>
                        <h2>{text.letter.headline}</h2>
                        <p>
                            <MultiLine text={text.letter.body} />
                        </p>
                        <div className="paper-signature">
                            {text.letter.signature}
                        </div>
                        <span className="paper-stamp">
                            <Icon name="check" size={19} /> {text.letter.stamp}
                        </span>
                        <span className="paper-note">{text.letter.note}</span>
                    </div>
                    <div className="ects-ticket">
                        <Icon name="cap" size={25} />
                        <span>
                            <strong>
                                {fill(TEXT.common.ectsAmount, {
                                    ects: TOTAL_ECTS,
                                })}
                            </strong>
                            <small>{text.letter.ticketCaption}</small>
                        </span>
                    </div>
                    <span className="scene-corner bottom">
                        {text.letter.cornerBottom}
                    </span>
                </div>
            </div>
            <div className="journey-strip" aria-label={text.journeyLabel}>
                {text.journey.map((step, index) => (
                    <div className="journey-item" key={index}>
                        <span className="step-number">
                            {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                            <strong>{step.title}</strong>
                            <p>
                                {fill(step.description, {
                                    years: YEARS.length,
                                    ects: TOTAL_ECTS,
                                })}
                            </p>
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

const BUILDER = TEXT.characterBuilder;
const HAIR_LENGTH_OPTIONS: HairLength[] = ["short", "long"];
const GLASSES_OPTIONS: Glasses[] = ["none", "glasses", "sunglasses"];
const GENDER_OPTIONS: Gender[] = ["unspecified", "female", "male", "nonbinary"];

export function CharacterBuilder({
    player,
    busy,
    error,
    onBack,
    onContinue,
    initializing = false,
    onSkip,
}: {
    player: Player;
    busy: boolean;
    error: string;
    onBack: (draft: Player) => void;
    onContinue: (draft: Player) => void;
    initializing?: boolean;
    onSkip?: () => void;
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
            setValidation(BUILDER.name.missing);
            nameInput.current?.focus();
            return;
        }
        setValidation("");
        onContinue({ ...draft, onboardingStage: "acceptance" });
    }
    return (
        <section
            className={`onboarding ${initializing ? "is-initializing" : ""}`}
            aria-busy={initializing}
        >
            <div className="section-heading">
                <span className="eyebrow">{BUILDER.eyebrow}</span>
                <h1>{BUILDER.title}</h1>
                <p>{BUILDER.subtitle}</p>
            </div>
            <div className="builder-layout">
                <div className="character-preview panel">
                    <div className="preview-top">
                        <span>{BUILDER.idCard.label}</span>
                        <span>{BUILDER.idCard.number}</span>
                    </div>
                    <div className="portrait-frame">
                        <Avatar
                            character={character}
                            label={fill(BUILDER.idCard.previewLabel, {
                                name:
                                    name.trim() ||
                                    BUILDER.idCard.previewFallbackName,
                            })}
                        />
                    </div>
                    <h2>{name.trim() || BUILDER.idCard.nameFallback}</h2>
                    <p>{DEPARTMENT}</p>
                    <span className="badge neutral">
                        <Icon name="cap" size={15} /> {BUILDER.idCard.badge}
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
                            <MultiLine text={BUILDER.idCard.validity} />
                        </span>
                    </div>
                </div>
                {initializing && (
                    <div className="profile-initializing" role="status">
                        <span
                            className="initialization-ring"
                            aria-hidden="true"
                        />
                        <span>{BUILDER.initializing}</span>
                        <button
                            type="button"
                            className="skip-animation"
                            onClick={onSkip}
                        >
                            {TEXT.common.skipAnimation}
                        </button>
                    </div>
                )}
                <form
                    className="builder-form panel"
                    inert={initializing}
                    onSubmit={submit}
                >
                    <div className="field">
                        <div className="label-row">
                            <label htmlFor="character-name">
                                {BUILDER.name.label}
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
                            placeholder={BUILDER.name.placeholder}
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
                            {validation || BUILDER.name.help}
                        </small>
                    </div>
                    <PhotoAvatar
                        disabled={busy}
                        onApply={(colors) =>
                            setCharacter((current) => ({
                                ...current,
                                ...colors,
                            }))
                        }
                    />
                    <fieldset className="appearance-fields" disabled={busy}>
                        <legend className="sr-only">
                            {BUILDER.appearanceLegend}
                        </legend>
                        <Swatches
                            label={BUILDER.hairColor}
                            colors={COLORS.hair}
                            value={character.hairColor}
                            onChange={(color) => choose("hairColor", color)}
                        />
                        <Swatches
                            label={BUILDER.skinColor}
                            colors={COLORS.skin}
                            value={character.skinColor}
                            onChange={(color) => choose("skinColor", color)}
                        />
                        <Swatches
                            label={BUILDER.eyeColor}
                            colors={COLORS.eyes}
                            value={character.eyeColor}
                            onChange={(color) => choose("eyeColor", color)}
                        />
                    </fieldset>
                    <div className="field">
                        <label htmlFor="hair-length">
                            {BUILDER.hairLength.label}
                        </label>
                        <select
                            id="hair-length"
                            value={character.hairLength}
                            disabled={busy}
                            onChange={(event) =>
                                setCharacter((current) => ({
                                    ...current,
                                    hairLength: event.target
                                        .value as HairLength,
                                }))
                            }
                        >
                            {HAIR_LENGTH_OPTIONS.map((value) => (
                                <option key={value} value={value}>
                                    {BUILDER.hairLength.options[value]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label htmlFor="glasses">{BUILDER.glasses.label}</label>
                        <select
                            id="glasses"
                            value={character.glasses}
                            disabled={busy}
                            onChange={(event) =>
                                setCharacter((current) => ({
                                    ...current,
                                    glasses: event.target.value as Glasses,
                                }))
                            }
                        >
                            {GLASSES_OPTIONS.map((value) => (
                                <option key={value} value={value}>
                                    {BUILDER.glasses.options[value]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label htmlFor="gender">{BUILDER.gender.label}</label>
                        <select
                            id="gender"
                            value={character.gender}
                            disabled={busy}
                            onChange={(event) =>
                                setCharacter((current) => ({
                                    ...current,
                                    gender: event.target.value as Gender,
                                }))
                            }
                        >
                            {GENDER_OPTIONS.map((value) => (
                                <option key={value} value={value}>
                                    {BUILDER.gender.options[value]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label htmlFor="major">
                            {BUILDER.department.label}
                        </label>
                        <select id="major" value={DEPARTMENT} disabled>
                            <option value={DEPARTMENT}>{DEPARTMENT}</option>
                        </select>
                        <small>{BUILDER.department.help}</small>
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
                            <Icon name="back" /> {TEXT.common.back}
                        </button>
                        <button className="button primary" disabled={busy}>
                            {busy ? TEXT.common.saving : TEXT.common.continue}{" "}
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
    phase = "idle",
    characters = 0,
    onSkip,
}: {
    player: Player;
    busy: boolean;
    error: string;
    onBegin: () => void;
    onBack: () => void;
    phase?: AdmissionPhase;
    characters?: number;
    onSkip?: () => void;
}) {
    const finished = phase === "idle" || phase === "complete";
    const reached = (step: AdmissionPhase) =>
        finished ||
        ADMISSION_PHASES.indexOf(phase) >= ADMISSION_PHASES.indexOf(step);
    return (
        <section className="story-wrap" data-phase={phase}>
            <div className="admission-status">
                <span className="eyebrow">{TEXT.admission.eyebrow}</span>
                {!finished && (
                    <button className="skip-animation" onClick={onSkip}>
                        {TEXT.common.skipAnimation}
                    </button>
                )}
            </div>
            <div className="story-card panel">
                <div className="story-header">
                    <div
                        className="admissions-emblem"
                        data-visible={reached("emblem")}
                    >
                        <Icon name="cap" size={32} />
                        <span>
                            <MultiLine text={TEXT.admission.emblem} />
                        </span>
                    </div>
                    <span
                        className="admission-stamp"
                        data-visible={reached("stamp")}
                    >
                        <Icon name="check" size={17} /> {TEXT.admission.stamp}
                        <span className="stamp-sparks" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                        </span>
                    </span>
                </div>
                <div className="story-body">
                    <div
                        className="admission-avatar-slot"
                        data-admission-avatar
                    >
                        <Avatar
                            character={player.character}
                            className={
                                phase === "travel" ? "avatar-in-transfer" : ""
                            }
                        />
                    </div>
                    <div className="admission-letter">
                        <div className="letter-reservation" aria-hidden="true">
                            <AdmissionLetter player={player} />
                        </div>
                        <div className="letter-print" aria-hidden="true">
                            <AdmissionLetter
                                player={player}
                                characters={
                                    finished || reached("edit")
                                        ? Infinity
                                        : characters
                                }
                                cursor={phase === "text"}
                            />
                        </div>
                        <div className="sr-only">
                            <AdmissionLetter player={player} />
                        </div>
                    </div>
                </div>
                <div className="story-footer" data-visible={reached("edit")}>
                    <span>
                        {fill(TEXT.admission.footerYears, {
                            years: YEARS.length,
                        })}{" "}
                        <span aria-hidden="true">/</span>{" "}
                        {fill(TEXT.common.ectsAmount, { ects: TOTAL_ECTS })}{" "}
                        <span aria-hidden="true">/</span>{" "}
                        {TEXT.admission.footerCheer}
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
                    className="button ghost admission-edit"
                    data-visible={reached("edit")}
                    onClick={onBack}
                    disabled={busy || !reached("begin")}
                    inert={!reached("begin")}
                >
                    <Icon name="back" /> {TEXT.common.editCharacter}
                </button>
                <button
                    className="button primary large admission-begin"
                    data-visible={reached("begin")}
                    onClick={onBegin}
                    disabled={busy || !finished}
                    inert={!finished}
                >
                    {busy ? TEXT.common.saving : TEXT.admission.begin}{" "}
                    <Icon name="arrow" />
                </button>
            </div>
        </section>
    );
}

interface GraduationScreenArgs {
    player: Player;
    ects: number;
    completedGameIds: string[];
    graduatedAt: string | null;
    preview?: boolean;
    onReturn: () => void;
    onLeaderboard: () => void;
    submissionError?: string;
    submitting?: boolean;
    onRetry?: () => void;
    celebrate?: boolean;
}

export function GraduationScreen(args: GraduationScreenArgs) {
    const [diplomaOpen, setDiplomaOpen] = useState(true);
    const text = TEXT.graduation;

    function handleLeaderboard() {
        setDiplomaOpen(false);
        args.onLeaderboard();
    }

    return (
        <>
            <section className={`${diplomaStyles.screen} panel`}>
                <span className="eyebrow reward-text">
                    {args.preview ? text.previewEyebrow : text.eyebrow}
                </span>
                <div className={diplomaStyles.portrait}>
                    <Avatar
                        character={args.player.character}
                        label={fill(TEXT.common.graduateAvatarLabel, {
                            name: args.player.name,
                        })}
                    />
                    <span className={diplomaStyles.seal}>
                        <Icon name="cap" size={26} />
                    </span>
                </div>
                <h1>
                    {fill(args.preview ? text.previewTitle : text.title, {
                        name: args.player.name,
                    })}
                </h1>
                <p className={diplomaStyles.lead}>
                    {args.preview
                        ? text.previewLead
                        : fill(text.lead, {
                              ending: endingFor(args.ects).title,
                          })}
                </p>
                <p>
                    {departmentLabel(args.player.major)}{" "}
                    <span aria-hidden="true">·</span>{" "}
                    <strong className="reward-text">
                        {fill(text.ectsEarned, { ects: args.ects })}
                    </strong>
                </p>
                <p className={diplomaStyles.copy}>
                    {args.preview ? TEXT.common.previewNotice : text.copy}
                </p>
                {!args.preview && args.submissionError && (
                    <div className={diplomaStyles.submission} role="status">
                        <p>{text.submissionFailed}</p>
                        <p className="error-text">{args.submissionError}</p>
                        {args.onRetry && (
                            <button
                                className="button secondary"
                                disabled={args.submitting}
                                onClick={args.onRetry}
                            >
                                {args.submitting
                                    ? TEXT.common.submitting
                                    : TEXT.common.retryLeaderboard}
                            </button>
                        )}
                    </div>
                )}
                <div className={diplomaStyles.actions}>
                    <button
                        className="button primary"
                        onClick={() => setDiplomaOpen(true)}
                    >
                        <Icon name="cap" /> {text.viewDiploma}
                    </button>
                    <button
                        className="button secondary"
                        onClick={handleLeaderboard}
                    >
                        <Icon name="trophy" /> {TEXT.common.viewLeaderboard}
                    </button>
                    <button className="button ghost" onClick={args.onReturn}>
                        <Icon name="back" /> {TEXT.common.returnToOverview}
                    </button>
                </div>
            </section>
            {diplomaOpen && (
                <Diploma
                    player={args.player}
                    ects={args.ects}
                    completedGameIds={args.completedGameIds}
                    graduatedAt={args.graduatedAt}
                    preview={args.preview}
                    submissionError={args.submissionError}
                    submitting={args.submitting}
                    onRetry={args.onRetry}
                    onClose={() => setDiplomaOpen(false)}
                    onLeaderboard={handleLeaderboard}
                />
            )}
        </>
    );
}
