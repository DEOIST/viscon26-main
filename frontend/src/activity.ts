// Pure date math for the activity graph: a year of week columns, Monday on top, ending today.
// Days are YYYY-MM-DD strings in the player's time zone (the server already converted them), so
// everything here is done in UTC to keep the browser's own offset out of it.

export const GRAPH_WEEKS = 53;
const DAY_MS = 86_400_000;

export type ActivityCell = { day: string; attempts: number; future: boolean };

function parseDay(day: string): number {
    return Date.parse(`${day}T00:00:00Z`);
}

function formatDay(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

export function buildWeeks(
    today: string,
    days: { day: string; attempts: number }[],
): ActivityCell[][] {
    const counts = new Map(days.map((entry) => [entry.day, entry.attempts]));
    const end = parseDay(today);
    const weekday = (new Date(end).getUTCDay() + 6) % 7; // Monday = 0
    const start = end - (weekday + (GRAPH_WEEKS - 1) * 7) * DAY_MS;
    return Array.from({ length: GRAPH_WEEKS }, (_, week) =>
        Array.from({ length: 7 }, (_, weekdayIndex) => {
            const ms = start + (week * 7 + weekdayIndex) * DAY_MS;
            const day = formatDay(ms);
            return { day, attempts: counts.get(day) ?? 0, future: ms > end };
        }),
    );
}

// Fixed steps rather than "relative to your busiest day", so a square means the same thing all
// year and an early, quiet week doesn't light up as brightly as a busy one later.
export function activityLevel(attempts: number): 0 | 1 | 2 | 3 | 4 {
    if (attempts === 0) return 0;
    if (attempts < 3) return 1;
    if (attempts < 6) return 2;
    if (attempts < 10) return 3;
    return 4;
}

/** The short month name above a week column when that week starts a new month, else "" */
export function monthLabel(weeks: ActivityCell[][], index: number): string {
    const month = weeks[index][0].day.slice(0, 7);
    if (index > 0 && weeks[index - 1][0].day.slice(0, 7) === month) return "";
    // The first column usually starts mid-month; its label would crowd the next one.
    if (index === 0 && weeks[1]?.[0].day.slice(0, 7) !== month) return "";
    return new Date(parseDay(weeks[index][0].day)).toLocaleDateString("en-GB", {
        month: "short",
        timeZone: "UTC",
    });
}

export function formatActivityDay(day: string): string {
    return new Date(parseDay(day)).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}
