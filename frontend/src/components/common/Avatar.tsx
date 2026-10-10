import type { Character } from "../../misc/CommonInt";
import { shellClass } from "../../misc/shellStyles";

interface AvatarArgs {
    character: Character;
    className?: string;
    label?: string;
}
export default function Avatar(args: AvatarArgs) {
    const { character, className = "", label = "Your character" } = args;
    return (
        <svg
            className={shellClass(`avatar ${className}`)}
            viewBox="0 0 180 200"
            role="img"
            aria-label={label}
        >
            <path
                d="M22 200v-28c0-32 30-49 68-49s68 17 68 49v28"
                fill="var(--primary)"
            />
            <path d="m64 145 26 26 26-26-9-12H73Z" fill="var(--surface)" />
            <path
                d="M76 121h28v27c-8 10-20 10-28 0Z"
                fill={character.skinColor}
                stroke="#152238"
                strokeWidth="3"
            />
            <path
                d="M43 72c-19-7-17 27 1 28m93-28c19-7 17 27-1 28"
                fill={character.skinColor}
                stroke="#152238"
                strokeWidth="3"
            />
            <path
                d="M43 62c0-30 94-30 94 0v33c0 30-24 47-47 47S43 125 43 95Z"
                fill={character.skinColor}
                stroke="#152238"
                strokeWidth="3"
            />
            <path
                d="M42 85C19 29 53 8 86 12c41-12 70 17 54 73l-13-27c-20 4-33-3-45-17-5 17-19 24-35 25Z"
                fill={character.hairColor}
                stroke="#152238"
                strokeWidth="3"
                strokeLinejoin="round"
            />
            <path
                d="m61 77 15-2m28 0 15 2"
                fill="none"
                stroke="#152238"
                strokeWidth="3"
                strokeLinecap="round"
            />
            <ellipse cx="70" cy="90" rx="8" ry="9" fill="#FFFFFF" />
            <ellipse cx="110" cy="90" rx="8" ry="9" fill="#FFFFFF" />
            <circle cx="71" cy="91" r="5" fill={character.eyeColor} />
            <circle cx="109" cy="91" r="5" fill={character.eyeColor} />
            <circle cx="72" cy="90" r="2" fill="#152238" />
            <circle cx="108" cy="90" r="2" fill="#152238" />
            <path
                d="m88 96-3 10h7m-13 12c7 6 15 6 22 0"
                fill="none"
                stroke="#152238"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            <path
                d="M51 179v21m78-21v21"
                stroke="#152238"
                strokeOpacity=".35"
                strokeWidth="3"
            />
        </svg>
    );
}
