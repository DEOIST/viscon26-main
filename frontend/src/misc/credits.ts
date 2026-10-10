// The degree's credits as one transcript: what each year's game paid (its score's share of the
// year's ECTS), the total out of 180, and the career that total leads to. Everything that
// shows credits (the student record, the feedback after a game, the graduation screen and the
// diploma) reads this, so the numbers always add up the same way the backend does.

import { TOTAL_ECTS, YEARS, endingFor } from "../config";
import config from "../../../shared/game-config.json";
import type { Ending, EndingId } from "./CommonInt";
import type { Game } from "../types";
import { TEXT } from "./text";

export interface CreditRow {
    yearTitle: string;
    gameId: string;
    gameTitle: string;
    available: number;
    earned: number | null; // null until the game is completed
    score: number | null; // 0–100, null until completed or for older saves
}

export interface CareerMark {
    id: EndingId;
    title: string;
    ects: number; // the total that reaches this career
}

export interface CreditSummary {
    rows: CreditRow[];
    earned: number;
    total: number;
    percent: number;
    ending: Ending;
    thresholds: CareerMark[]; // lowest first
    next: (CareerMark & { ectsNeeded: number }) | null;
}

// A game pays its ECTS in proportion to its score, rounded half up; a completion without a
// score (older saves) pays in full. Mirrors backend/app/shell_config.py.
export function gameEcts(game: Game, score: number | undefined): number {
    return Math.floor((game.ects * (score ?? 100)) / 100 + 0.5);
}

// The ECTS a career starts at: the smallest total whose floored percent reaches it.
const THRESHOLDS: CareerMark[] = [...config.endings]
    .sort((a, b) => a.minPercent - b.minPercent)
    .map((ending) => ({
        id: ending.id as EndingId,
        title: TEXT.endings[ending.id as EndingId].title,
        ects: Math.ceil((ending.minPercent * TOTAL_ECTS) / 100),
    }));

export function creditSummary(
    completedGameIds: string[],
    scores: Record<string, number>,
): CreditSummary {
    const rows = YEARS.flatMap((year) =>
        year.games.map((game) => {
            const done = game.implemented && completedGameIds.includes(game.id);
            return {
                yearTitle: year.title,
                gameId: game.id,
                gameTitle: game.title,
                available: game.ects,
                earned: done ? gameEcts(game, scores[game.id]) : null,
                score: done ? (scores[game.id] ?? null) : null,
            };
        }),
    );
    const earned = rows.reduce((sum, row) => sum + (row.earned ?? 0), 0);
    const upcoming = THRESHOLDS.find((mark) => mark.ects > earned);
    return {
        rows,
        earned,
        total: TOTAL_ECTS,
        percent: Math.floor((100 * earned) / TOTAL_ECTS),
        ending: endingFor(earned),
        thresholds: THRESHOLDS,
        next: upcoming
            ? { ...upcoming, ectsNeeded: upcoming.ects - earned }
            : null,
    };
}
