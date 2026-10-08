// Every API / domain type lives here. Mirrors backend/app/schemas.py — change both together.
//
// Convention: `XWHid` ("without id") is the create payload the client sends;
// `X extends XWHid` is what the server returns, adding `id` and timestamps.
// Field names are camelCase here and snake_case in Python (Pydantic converts on the wire).

export interface ApiResult<T> {
    data: T | null;
    status: number; // HTTP status code; 0 means the request never reached the server
    error: string | null;
}

export interface HealthStatus {
    status: string;
    environment: string;
}

// --- Example feature (delete once you have real features) ---

export interface ItemWHid {
    title: string;
    description: string;
}

export interface Item extends ItemWHid {
    id: string;
    createdAt: string; // ISO 8601
}
