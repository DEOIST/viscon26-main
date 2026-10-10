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

// --- story (OpenAI-backed) ---

export type AiSource = "ai" | "fallback";
export type DialogueScene = "campus" | "blackjack" | "shooter";

export interface DialogueRequest {
    scene: DialogueScene;
}

export interface DialoguePack {
    scene: DialogueScene;
    lines: Record<string, string[]>; // event key → lines; keys per scene in docs/GAME_DESIGN.md
    source: AiSource;
}

export interface Epilogue {
    text: string;
    source: AiSource;
}

// --- cv (finger-detection engine, issue #13) ---

export type Tracking = "ok" | "noPose" | "lost";
export type GamePoint = [number, number]; // [x, y] in the game area, 0..1

export interface CvStatus {
    available: boolean;
    reason: string | null; // why it isn't available
    activeSessions: number;
    maxSessions: number;
}

// One processed camera frame from /api/cv/stream (WebSocket, see backend/app/routers/cv.py).
export interface CvFrame {
    type: "frame";
    tracking: Tracking;
    aim: GamePoint | null;
    firedAt: GamePoint | null; // set on the frame a shot fires
    landmarks: GamePoint[] | null; // 21 points for drawing the hand; may lie outside 0..1
    thumbDistance: number | null; // metres, for the debug overlay
    processingMs: number;
}

// Control messages the browser sends on /api/cv/stream (CvBoxMessage, CvSettingsMessage in
// schemas.py; the engine answers a bad one with {type: "error", detail}).
export interface CvBoxMessage {
    type: "box";
    box: [number, number, number, number]; // mirrored camera image 0..1; each side ≥ 0.1
}
export interface CvSettingsMessage {
    type: "settings";
    cooldownMs: number; // 0–2000
}
