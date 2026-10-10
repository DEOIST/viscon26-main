import type { Player, Progress, Snapshot } from "./types";
import { GAMES, profileMajor } from "./config";
import type { PublicConfig, ShellPlayer } from "./misc/CommonInt";
import { TEXT } from "./misc/text";
/** Suggested colors read from a photo; all null when the AI is unavailable */
export type AvatarSuggestion = {
    hairColor: string | null;
    hairLength: "short" | "long" | null;
    eyeColor: string | null;
    glasses: "none" | "glasses" | "sunglasses" | null;
    gender: "male" | "female" | "unclear" | null;
    source: "ai" | "fallback";
};
export type ScoreRow = {
    name: string;
    major: string;
    ects: number;
    graduated: boolean;
};
export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}
// A casual run identifier, not an identity credential. Preserve the existing progress key.
const PLAYER_KEY = "eth-simulator.player-id.v1";
let memoryId: string | undefined;
export function anonymousPlayerId() {
    if (memoryId) return memoryId;
    try {
        const saved = localStorage.getItem(PLAYER_KEY);
        if (saved && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved))
            return (memoryId = saved);
    } catch {
        /* Browser storage is optional for play. */
    }
    memoryId = crypto.randomUUID();
    try {
        localStorage.setItem(PLAYER_KEY, memoryId);
    } catch {
        /* In-memory fallback. */
    }
    return memoryId;
}
async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            signal: AbortSignal.timeout(15000),
            headers: {
                ...(body === undefined
                    ? {}
                    : { "Content-Type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    } catch {
        throw new ApiError(TEXT.errors.offline, 0);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(
            typeof data?.detail === "string"
                ? data.detail
                : response.status === 422
                  ? TEXT.errors.invalidInput
                  : TEXT.errors.serverFailed,
            response.status,
        );
    }
    return data as T;
}
function profileBody(player: Player) {
    return {
        name: player.name,
        ...player.character,
        major: profileMajor(player.major),
        onboardingStage: player.onboardingStage,
    };
}
const playerPath = () => `/players/${anonymousPlayerId()}`;
let pending: Promise<unknown> = Promise.resolve();
export const api = {
    config: () => request<PublicConfig>("/config"),
    player: () => request<ShellPlayer>(playerPath()),
    // Serialize snapshots so a slow builder save cannot overwrite a later main-stage save.
    synchronize(snapshot: Snapshot): Promise<Progress> {
        const sync = pending
            .catch(() => {})
            .then(async () => {
                const saved = await request<ShellPlayer>(
                    playerPath(),
                    "PUT",
                    profileBody(snapshot.player),
                );
                let progress: Progress = saved.progress;
                if (snapshot.player.onboardingStage === "main") {
                    for (const game of GAMES) {
                        if (
                            game.implemented &&
                            snapshot.progress.completedGameIds.includes(
                                game.id,
                            ) &&
                            !progress.completedGameIds.includes(game.id)
                        ) {
                            progress = await request<Progress>(
                                `${playerPath()}/completions/${encodeURIComponent(game.id)}`,
                                "POST",
                            );
                        }
                    }
                    if (snapshot.progress.graduated && !progress.graduated)
                        progress = await request<Progress>(
                            `${playerPath()}/graduation`,
                            "POST",
                        );
                }
                return progress;
            });
        pending = sync;
        return sync;
    },
    scoreboard: () => request<ScoreRow[]>("/scoreboard"),
    avatarSuggestion: (image: string) =>
        request<AvatarSuggestion>("/avatar/suggestion", "POST", {
            image,
        }),
};
export const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : TEXT.errors.unknown;
