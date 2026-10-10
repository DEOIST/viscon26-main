import config from "../../shared/game-config.json";
import type { Game, Year } from "./types";

export const YEARS: Year[] = config.years;
export const GAMES: Game[] = YEARS.flatMap((year) => year.games);
export const TOTAL_ECTS = config.totalEcts;
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
