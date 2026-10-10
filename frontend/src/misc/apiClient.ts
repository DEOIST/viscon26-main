// Browser client for the backend. One `api<Name>` function per backend route handler, named
// `api` + the PascalCase of the Python handler name: `get_run_by_id` → `apiGetRunById`.
// Paths are relative and same-origin (FastAPI serves the frontend), so there is no base URL.

import type {
    ApiResult,
    CvStatus,
    DialoguePack,
    DialogueRequest,
    EndingStats,
    Epilogue,
    HealthStatus,
    LeaderboardEntry,
    Run,
    RunWHid,
    ScoreSubmission,
} from "./CommonInt";

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
): Promise<ApiResult<T>> {
    try {
        const res = await fetch(`/api${path}`, {
            method,
            headers:
                body === undefined
                    ? undefined
                    : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json: unknown =
            res.status === 204 ? null : await res.json().catch(() => null);
        if (!res.ok) {
            return {
                data: null,
                status: res.status,
                error: readError(json) ?? res.statusText,
            };
        }
        return { data: json as T, status: res.status, error: null };
    } catch (err) {
        return { data: null, status: 0, error: errorMessage(err) };
    }
}

// FastAPI errors are `{detail: "..."}`, or `{detail: [{msg, ...}]}` for validation errors.
function readError(body: unknown): string | null {
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail.map((d) => d?.msg ?? String(d)).join("; ");
    return null;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function runPath(runId: string): string {
    return `/runs/${encodeURIComponent(runId)}`;
}

// --- health ---

export function apiGetHealth() {
    return request<HealthStatus>("GET", "/health");
}

// --- runs ---

export function apiCreateRun(payload: RunWHid) {
    return request<Run>("POST", "/runs", payload);
}

export function apiGetRunById(runId: string) {
    return request<Run>("GET", runPath(runId));
}

export function apiSubmitScore(runId: string, payload: ScoreSubmission) {
    return request<Run>("POST", `${runPath(runId)}/scores`, payload);
}

export function apiGraduateRun(runId: string) {
    return request<Run>("POST", `${runPath(runId)}/graduate`);
}

// --- leaderboard ---

export function apiListLeaderboard(limit = 10) {
    return request<LeaderboardEntry[]>("GET", `/leaderboard?limit=${limit}`);
}

export function apiGetEndingStats() {
    return request<EndingStats>("GET", "/leaderboard/endings");
}

// --- story ---
// POST because these may spend OpenAI credits; the server caches them, so repeating is free.

export function apiGenerateDialogue(runId: string, payload: DialogueRequest) {
    return request<DialoguePack>("POST", `${runPath(runId)}/dialogue`, payload);
}

export function apiGenerateEpilogue(runId: string) {
    return request<Epilogue>("POST", `${runPath(runId)}/epilogue`);
}

// The one non-JSON endpoint: returns an object URL for an <audio> element. The caller revokes
// it with URL.revokeObjectURL when done. 503 means "no narration": play the fallback audio.
export async function apiGenerateEpilogueSpeech(
    runId: string,
): Promise<ApiResult<string>> {
    try {
        const res = await fetch(`/api${runPath(runId)}/epilogue/speech`, {
            method: "POST",
        });
        if (!res.ok) {
            const json: unknown = await res.json().catch(() => null);
            return {
                data: null,
                status: res.status,
                error: readError(json) ?? res.statusText,
            };
        }
        const audioUrl = URL.createObjectURL(await res.blob());
        return { data: audioUrl, status: res.status, error: null };
    } catch (err) {
        return { data: null, status: 0, error: errorMessage(err) };
    }
}

// --- cv ---
// The frame stream itself is a WebSocket owned by the shooter (games/shooter/input/cvStream.ts).

export function apiGetCvStatus() {
    return request<CvStatus>("GET", "/cv/status");
}
