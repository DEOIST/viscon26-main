import {
    AVATAR_EYES,
    AVATAR_FACE_COLORS,
    AVATAR_FACES,
    AVATAR_INK,
    AVATAR_PATHS,
} from "../avatarArt";
import type { Character } from "../types";
import { TEXT } from "../misc/text";

// "calm" is the builder's portrait; the others are for moments that react (the Year 1 intro).
export type AvatarExpression = "calm" | "happy" | "hurt" | "crying";

const line = {
    fill: "none",
    stroke: AVATAR_INK,
    strokeLinecap: "round",
    strokeLinejoin: "round",
} as const;

export function Avatar({
    character,
    className = "",
    label = TEXT.common.avatarLabel,
    expression = "calm",
    blinking = false,
}: {
    character: Character;
    className?: string;
    label?: string;
    expression?: AvatarExpression;
    blinking?: boolean; // closes open eyes, for one frame of a blink
}) {
    const pained = expression === "hurt" || expression === "crying";
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
                d={
                    pained
                        ? AVATAR_FACES.browsSad
                        : expression === "happy"
                          ? AVATAR_FACES.browsHappy
                          : AVATAR_PATHS.brows
                }
                {...line}
                strokeWidth={expression === "calm" ? 3 : 3.5}
            />
            {pained && (
                <path
                    d={AVATAR_FACES.eyesSqueezed}
                    {...line}
                    strokeWidth="3.5"
                />
            )}
            {!pained && blinking && (
                <path d={AVATAR_FACES.eyesClosed} {...line} strokeWidth="3" />
            )}
            {expression === "crying" && (
                <path
                    d={AVATAR_FACES.tears}
                    {...line}
                    stroke={AVATAR_FACE_COLORS.tear}
                    strokeWidth="5"
                />
            )}
            {expression === "happy" &&
                AVATAR_FACES.blush.map((cheek) => (
                    <ellipse
                        key={cheek.x}
                        cx={cheek.x}
                        cy={cheek.y}
                        rx="8"
                        ry="4.5"
                        fill={AVATAR_FACE_COLORS.blush}
                        fillOpacity=".6"
                    />
                ))}
            {!pained &&
                !blinking &&
                AVATAR_EYES.map((eye) => (
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
                d={
                    AVATAR_PATHS.nose +
                    (expression === "calm" ? AVATAR_PATHS.smile : "")
                }
                fill="none"
                stroke={AVATAR_INK}
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            {pained && (
                <path
                    d={AVATAR_FACES.mouthCry}
                    fill={AVATAR_FACE_COLORS.mouth}
                    stroke={AVATAR_INK}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                />
            )}
            {expression === "happy" && (
                <>
                    <path
                        d={AVATAR_FACES.mouthGrin}
                        fill={AVATAR_FACE_COLORS.mouth}
                        stroke={AVATAR_INK}
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                    />
                    <path d={AVATAR_FACES.grinTeeth} fill="#FFFFFF" />
                    <path
                        d={AVATAR_FACES.grinTongue}
                        fill={AVATAR_FACE_COLORS.tongue}
                    />
                </>
            )}
            <path
                d={AVATAR_PATHS.bodyLines}
                stroke={AVATAR_INK}
                strokeOpacity=".35"
                strokeWidth="3"
            />
        </svg>
    );
}
