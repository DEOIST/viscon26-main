// Source shell metadata adapted to the destination's two independent activities.
import config from "../../../shared/game-config.json";
import type { Character, ShellGame } from "./CommonInt";

export const GAMES = config.games as ShellGame[];
export const TOTAL_ECTS = config.totalEcts;
export const COLORS = config.colors;
export const DEFAULT_CHARACTER: Character = {
    name: "",
    pronouns: "they",
    department: "infk",
    archetype: "nerd",
    avatar: "a1",
    hairColor: COLORS.hair[1].value,
    skinColor: COLORS.skin[1].value,
    eyeColor: COLORS.eyes[0].value,
};
