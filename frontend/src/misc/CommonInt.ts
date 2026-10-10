// Every API / domain type lives here. Mirrors backend/app/schemas.py â€” change both together.
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

// --- runs ---

export type GameId = "blackjack" | "shooter";
export type EndingId =
    "c_level" | "big_tech" | "phd" | "mcdonalds" | "unemployed";
export type Pronouns = "she" | "he" | "they";
export type DepartmentId =
    | "arch"
    | "baug"
    | "biol"
    | "bsse"
    | "chab"
    | "erdw"
    | "gess"
    | "hest"
    | "infk"
    | "itet"
    | "math"
    | "matl"
    | "mavt"
    | "mtec"
    | "phys"
    | "usys";
export type ArchetypeId = "nerd" | "risk_taker" | "gamer" | "athlete";

export interface Character {
    name: string; // 1â€“20 chars: letters (accents allowed), digits, space, . ' _ -
    pronouns: Pronouns;
    department: DepartmentId;
    archetype: ArchetypeId;
    avatar: string; // preset id "a1"â€¦"a8" (misc/character.ts)
    hairColor: string;
    skinColor: string;
    eyeColor: string;
}

export interface RunWHid {
    character: Character;
}

export interface Ending {
    id: EndingId;
    title: string;
}

export interface Run extends RunWHid {
    id: string;
    createdAt: string; // ISO 8601
    scores: Partial<Record<GameId, number>>; // integer 0â€“100 per finished minigame
    totalScore: number | null; // set at graduation
    ending: Ending | null; // set at graduation
    graduatedAt: string | null;
    completedGameIds: GameId[];
    ectsPoints: number;
}

export interface ScoreSubmission {
    game: GameId;
    score: number; // integer 0â€“100
}

// --- leaderboard ---

export interface LeaderboardEntry {
    runId: string;
    name: string;
    avatar: string;
    department: DepartmentId;
    totalScore: number;
    endingId: EndingId;
    graduatedAt: string;
}

export interface EndingStats {
    total: number;
    counts: Record<EndingId, number>;
}

// --- shell ---
export interface ShellGame {
    id: GameId;
    title: string;
    description: string;
    ects: number;
    implemented: boolean;
}
