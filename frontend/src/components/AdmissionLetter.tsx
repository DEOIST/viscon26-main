import { departmentLabel } from "../config";
import { fill, TEXT } from "../misc/text";
import type { Player } from "../types";

type LetterPart = string | { strong: string };

// "**text**" in text.json marks bold parts. Split before filling, so a name can't add bold.
function letterParts(
    template: string,
    values: Record<string, string> = {},
): LetterPart[] {
    return template.split("**").flatMap((part, index) => {
        if (part === "") return [];
        const filled = fill(part, values);
        return [index % 2 === 1 ? { strong: filled } : filled];
    });
}

export function admissionBlocks(player: Player): LetterPart[][] {
    const letter = TEXT.admission.letter;
    return [
        letterParts(letter.greeting, { name: player.name.toUpperCase() }),
        letterParts(letter.headline),
        letterParts(letter.acceptance, {
            name: player.name,
            department: departmentLabel(player.major),
        }),
        letterParts(letter.body),
        letterParts(letter.signoff),
    ];
}

export const admissionLengths = (player: Player) =>
    admissionBlocks(player).map((block) =>
        block.reduce(
            (length, part) =>
                length + (typeof part === "string" ? part : part.strong).length,
            0,
        ),
    );

interface AdmissionLetterArgs {
    player: Player;
    characters?: number;
    cursor?: boolean;
}

export default function AdmissionLetter(args: AdmissionLetterArgs) {
    let remaining = args.characters ?? Infinity;
    return admissionBlocks(args.player).map((block, index) => {
        const length = block.reduce(
            (sum, part) =>
                sum + (typeof part === "string" ? part : part.strong).length,
            0,
        );
        const active = remaining >= 0 && remaining < length;
        const content = block.map((part, partIndex) => {
            const text = typeof part === "string" ? part : part.strong;
            const visible = text.slice(0, Math.max(0, remaining));
            remaining -= text.length;
            return typeof part === "string" ? (
                visible
            ) : (
                <strong key={partIndex}>{visible}</strong>
            );
        });
        const cursor =
            args.cursor && active ? <span className="terminal-cursor" /> : null;
        if (index === 1)
            return (
                <h1 key={index}>
                    {content}
                    {cursor}
                </h1>
            );
        return (
            <p
                key={index}
                className={
                    index === 0
                        ? "eyebrow"
                        : index === 4
                          ? "story-signoff"
                          : undefined
                }
            >
                {content}
                {cursor}
            </p>
        );
    });
}
