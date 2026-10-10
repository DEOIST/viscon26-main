import config from "../../shared/game-config.json";
import type { Ending, EndingId } from "./misc/CommonInt";
import type { Game, Year } from "./types";
import { TEXT } from "./misc/text";

export const YEARS: Year[] = config.years;
export const GAMES: Game[] = YEARS.flatMap((year) => year.games);
export const TOTAL_ECTS = config.totalEcts;
// Best first; the backend reads the same tiers (services/endings.py).
const ENDINGS = [...config.endings].sort((a, b) => b.minPercent - a.minPercent);
export function endingFor(ects: number): Ending {
    const percent = Math.floor((100 * ects) / TOTAL_ECTS);
    const tier = ENDINGS.find((ending) => percent >= ending.minPercent)!;
    const id = tier.id as EndingId;
    return { id, title: TEXT.endings[id].title };
}
export const MAJOR = config.major;
export const DEPARTMENT = "D-INFK";
export const isSupportedMajor = (major: unknown): major is string =>
    typeof major === "string" &&
    [MAJOR, DEPARTMENT, "infk", "Computer Science (D-INFK)"].includes(major);
export const departmentLabel = (major: string) =>
    isSupportedMajor(major) ? DEPARTMENT : major;
export const profileMajor = (major: string) =>
    isSupportedMajor(major) ? MAJOR : major;
export const COLORS = config.colors;
