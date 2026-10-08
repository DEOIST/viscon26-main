// Browser client for the backend. One `api<Name>` function per backend route handler, named
// `api` + the PascalCase of the Python handler name: `get_item_by_id` → `apiGetItemById`.
// Paths are relative and same-origin (FastAPI serves the frontend), so there is no base URL.

import type { ApiResult, HealthStatus, Item, ItemWHid } from "./CommonInt";

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
        return {
            data: null,
            status: 0,
            error: err instanceof Error ? err.message : String(err),
        };
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

// --- health ---

export function apiGetHealth() {
    return request<HealthStatus>("GET", "/health");
}

// --- items (example feature) ---

export function apiListItems() {
    return request<Item[]>("GET", "/items");
}

export function apiGetItemById(itemId: string) {
    return request<Item>("GET", `/items/${encodeURIComponent(itemId)}`);
}

export function apiCreateItem(payload: ItemWHid) {
    return request<Item>("POST", "/items", payload);
}

export function apiDeleteItem(itemId: string) {
    return request<null>("DELETE", `/items/${encodeURIComponent(itemId)}`);
}
