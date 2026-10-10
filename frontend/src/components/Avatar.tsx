import { AVATAR_EYES, AVATAR_INK, AVATAR_PATHS } from "../avatarArt";
import type { Character } from "../types";

export function Avatar({
    character,
    className = "",
    label = "Your character",
}: {
    character: Character;
    className?: string;
    label?: string;
}) {
    return (
        <svg
            className={`avatar ${className}`}
            viewBox="0 0 180 200"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={label}
        >
            <path d={AVATAR_PATHS.body} fill="var(--primary)" />
            <path d={AVATAR_PATHS.collar} fill="var(--surface)" />
            <path
                d={AVATAR_PATHS.neck}
                fill={character.skinColor}
                stroke={AVATAR_INK}
                strokeWidth="3"
            />
            <path
                d={AVATAR_PATHS.ears}
                fill={character.skinColor}
                stroke={AVATAR_INK}
                strokeWidth="3"
            />
            {character.hairLength === "long" && (
                <path
                    d={AVATAR_PATHS.longHair}
                    fill={character.hairColor}
                    stroke={AVATAR_INK}
                    strokeWidth="3"
                    strokeLinejoin="round"
                    data-testid="avatar-long-hair"
                />
            )}
            <path
                d={AVATAR_PATHS.face}
                fill={character.skinColor}
                stroke={AVATAR_INK}
                strokeWidth="3"
            />
            <path
                d={AVATAR_PATHS.hair}
                fill={character.hairColor}
                stroke={AVATAR_INK}
                strokeWidth="3"
                strokeLinejoin="round"
            />
            <path
                d={AVATAR_PATHS.brows}
                fill="none"
                stroke={AVATAR_INK}
                strokeWidth="3"
                strokeLinecap="round"
            />
            {AVATAR_EYES.map((eye) => (
                <g key={eye.white.x}>
                    <ellipse
                        cx={eye.white.x}
                        cy={eye.white.y}
                        rx="8"
                        ry="9"
                        fill="#FFFFFF"
                    />
                    <circle
                        cx={eye.iris.x}
                        cy={eye.iris.y}
                        r="5"
                        fill={character.eyeColor}
                    />
                    <circle
                        cx={eye.pupil.x}
                        cy={eye.pupil.y}
                        r="2"
                        fill={AVATAR_INK}
                    />
                </g>
            ))}
            {character.glasses !== "none" && (
                <g
                    fill={
                        character.glasses === "sunglasses" ? AVATAR_INK : "none"
                    }
                    fillOpacity={0.88}
                    stroke={AVATAR_INK}
                    strokeWidth="3"
                    strokeLinecap="round"
                    data-testid="avatar-glasses"
                >
                    {AVATAR_EYES.map((eye) => (
                        <circle
                            key={eye.white.x}
                            cx={eye.white.x}
                            cy={eye.white.y}
                            r="13"
                        />
                    ))}
                    <path d={AVATAR_PATHS.glassesBridge} fill="none" />
                </g>
            )}
            <path
                d={AVATAR_PATHS.nose + AVATAR_PATHS.smile}
                fill="none"
                stroke={AVATAR_INK}
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            <path
                d={AVATAR_PATHS.bodyLines}
                stroke={AVATAR_INK}
                strokeOpacity=".35"
                strokeWidth="3"
            />
        </svg>
    );
}
