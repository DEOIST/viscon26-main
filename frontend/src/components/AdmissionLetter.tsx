import { departmentLabel } from "../config";
import type { Player } from "../types";

export function admissionBlocks(player: Player) {
    return [
        [`DEAR ${player.name.toUpperCase()},`],
        ["Welcome to the\nnext three years."],
        [
            "Congratulations, ",
            { strong: player.name },
            "! You have been accepted into ",
            { strong: departmentLabel(player.major) },
            ".",
        ],
        [
            "Your potential is impressive. Your free time has been successfully unenrolled.",
        ],
        ["Warm regards,\n", { strong: "The unofficial admissions team" }],
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
