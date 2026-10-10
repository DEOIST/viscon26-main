import type { Player, Progress } from "./types";
import { profileMajor } from "./config";

export type SessionData = {
    user: { id: number } | null;
    csrfToken: string;
    profile: Player | null;
    progress: Progress;
};
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
/** One finished round of a minigame, replays included */
export type Attempt = {
    id: number;
    gameId: string;
    score: number;
    finishedAt: string;
};
/** Days are YYYY-MM-DD in the player's time zone; only days with rounds are listed */
export type ActivitySummary = {
    today: string;
    days: { day: string; attempts: number }[];
    totalAttempts: number;
    activeDays: number;
    currentStreak: number;
    longestStreak: number;
    bestScores: Record<string, number>;
};
export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}
let csrfToken = "";
async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            credentials: "same-origin",
            signal: AbortSignal.timeout(15000),
            headers: {
                ...(body === undefined
                    ? {}
                    : { "Content-Type": "application/json" }),
                ...(method === "GET" ? {} : { "X-CSRF-Token": csrfToken }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    } catch {
        throw new ApiError(
            "Cannot reach the server. Check your connection and try again.",
            0,
        );
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(
            typeof data?.detail === "string"
                ? data.detail
                : response.status === 422
                  ? "Please check your details and try again."
                  : "The server could not finish that request. Please try again.",
            response.status,
        );
    }
    return data as T;
}
async function sessionRequest(path: string, method = "GET", body?: unknown) {
    const data = await request<SessionData>(path, method, body);
    csrfToken = data.csrfToken;
    return { ...data, progress: progressOnly(data.progress) };
}
const progressOnly = ({ completedGameIds, graduated }: Progress): Progress => ({
    completedGameIds,
    graduated,
});
export const api = {
    session: () => sessionRequest("/session"),
    auth: async (
        mode: "login" | "register",
        identifier: string,
        password: string,
    ) => {
        if (!csrfToken) await sessionRequest("/session");
        return sessionRequest(`/${mode}`, "POST", { identifier, password });
    },
    logout: () => sessionRequest("/logout", "POST"),
    saveProfile: (player: Player) =>
        request<Player>("/profile", "PUT", {
            name: player.name,
            ...player.character,
            major: profileMajor(player.major),
            onboardingStage: player.onboardingStage,
        }),
    progress: () => request<Progress>("/progress").then(progressOnly),
    complete: (id: string) =>
        request<Progress>(
            `/completions/${encodeURIComponent(id)}`,
            "POST",
        ).then(progressOnly),
    graduate: () => request<Progress>("/graduation", "POST").then(progressOnly),
    scoreboard: () => request<ScoreRow[]>("/scoreboard"),
    recordAttempt: (gameId: string, score: number) =>
        request<Attempt>("/attempts", "POST", { gameId, score }),
    attempts: (limit = 10) => request<Attempt[]>(`/attempts?limit=${limit}`),
    activity: async () => {
        // Days are counted in the player's own time zone, so a late-night round counts today.
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        try {
            return await request<ActivitySummary>(
                `/activity?tz=${encodeURIComponent(zone)}`,
            );
        } catch (err) {
            // A zone the server doesn't know: UTC days beat no graph at all.
            if (err instanceof ApiError && err.status === 422 && zone !== "UTC")
                return request<ActivitySummary>("/activity?tz=UTC");
            throw err;
        }
    },
    avatarSuggestion: async (image: string) => {
        if (!csrfToken) await sessionRequest("/session");
        return request<AvatarSuggestion>("/avatar/suggestion", "POST", {
            image,
        });
    },
};
export const errorMessage = (error: unknown) =>
    error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
