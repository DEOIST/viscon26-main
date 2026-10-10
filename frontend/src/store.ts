import {
    configureStore,
    createSlice,
    type PayloadAction,
} from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import {
    COLORS,
    GAMES,
    isSupportedMajor,
    MAJOR,
    TOTAL_ECTS,
    YEARS,
} from "./config";
import type {
    Gender,
    Glasses,
    HairLength,
    Player,
    Progress,
    Snapshot,
    Year,
} from "./types";

const GENDERS: Gender[] = ["unspecified", "female", "male", "nonbinary"];
const GLASSES: Glasses[] = ["none", "glasses", "sunglasses"];
const HAIR_LENGTHS: HairLength[] = ["short", "long"];

export const defaultPlayer: Player = {
    name: "",
    major: MAJOR,
    onboardingStage: "welcome",
    character: {
        hairColor: COLORS.hair[1].value,
        skinColor: COLORS.skin[1].value,
        eyeColor: COLORS.eyes[0].value,
        gender: "unspecified",
        glasses: "none",
        hairLength: "short",
    },
};
export const emptyProgress: Progress = {
    completedGameIds: [],
    graduated: false,
};
export const isYearComplete = (year: Year, ids: string[]) =>
    year.games.every((game) => ids.includes(game.id));
export const isYearUnlocked = (index: number, ids: string[]) =>
    YEARS.slice(0, index).every((year) => isYearComplete(year, ids));
export const calculateEcts = (ids: string[]) =>
    GAMES.reduce(
        (sum, game) =>
            sum + (game.implemented && ids.includes(game.id) ? game.ects : 0),
        0,
    );
export const canGraduate = (ids: string[]) =>
    YEARS.every((year) => isYearComplete(year, ids)) &&
    calculateEcts(ids) === TOTAL_ECTS;

const playerSlice = createSlice({
    name: "player",
    initialState: defaultPlayer,
    reducers: {
        replacePlayer: (_state, action: PayloadAction<Player>) =>
            action.payload,
        setStage: (state, action: PayloadAction<Player["onboardingStage"]>) => {
            state.onboardingStage = action.payload;
        },
    },
});
const progressSlice = createSlice({
    name: "progress",
    initialState: emptyProgress,
    reducers: {
        replaceProgress: (_state, action: PayloadAction<Progress>) =>
            action.payload,
        completeGame: (state, action: PayloadAction<string>) => {
            const index = YEARS.findIndex((year) =>
                year.games.some(
                    (game) => game.id === action.payload && game.implemented,
                ),
            );
            if (
                index >= 0 &&
                isYearUnlocked(index, state.completedGameIds) &&
                !state.completedGameIds.includes(action.payload)
            ) {
                state.completedGameIds.push(action.payload);
            }
        },
        markGraduated: (state) => {
            if (canGraduate(state.completedGameIds)) state.graduated = true;
        },
    },
});
export const { replacePlayer, setStage } = playerSlice.actions;
export const { replaceProgress, completeGame, markGraduated } =
    progressSlice.actions;
export const createAppStore = (snapshot?: Snapshot) =>
    configureStore({
        reducer: {
            player: playerSlice.reducer,
            progress: progressSlice.reducer,
        },
        preloadedState: snapshot,
    });

const GUEST_KEY = "eth-simulator.guest.v1";
export function readGuest(): Snapshot {
    const fallback = { player: defaultPlayer, progress: emptyProgress };
    try {
        const saved = JSON.parse(localStorage.getItem(GUEST_KEY) || "null");
        if (!saved || saved.version !== 1) return fallback;
        const player = saved.player as Player;
        // Saves from before these fields existed: keep them, use the defaults
        if (player?.character)
            player.character = {
                ...player.character,
                gender: GENDERS.includes(player.character.gender)
                    ? player.character.gender
                    : "unspecified",
                glasses: GLASSES.includes(player.character.glasses)
                    ? player.character.glasses
                    : "none",
                hairLength: HAIR_LENGTHS.includes(player.character.hairLength)
                    ? player.character.hairLength
                    : "short",
            };
        if (
            typeof player?.name !== "string" ||
            player.name.trim().length > 24 ||
            !isSupportedMajor(player.major) ||
            !["welcome", "builder", "acceptance", "main"].includes(
                player.onboardingStage,
            ) ||
            !COLORS.hair.some((c) => c.value === player.character?.hairColor) ||
            !COLORS.skin.some((c) => c.value === player.character?.skinColor) ||
            !COLORS.eyes.some((c) => c.value === player.character?.eyeColor)
        )
            return fallback;
        if (
            ["acceptance", "main"].includes(player.onboardingStage) &&
            !player.name.trim()
        )
            return fallback;
        const ids: string[] = [];
        for (let index = 0; index < YEARS.length; index++) {
            if (!isYearUnlocked(index, ids)) break;
            for (const game of YEARS[index].games) {
                if (
                    game.implemented &&
                    Array.isArray(saved.progress?.completedGameIds) &&
                    saved.progress.completedGameIds.includes(game.id)
                )
                    ids.push(game.id);
            }
        }
        return {
            player: { ...player, name: player.name.trim() },
            progress: {
                completedGameIds: ids,
                graduated:
                    saved.progress?.graduated === true && canGraduate(ids),
            },
        };
    } catch {
        return fallback;
    }
}
export const store = createAppStore(readGuest());
let guestPersistence = false;
export const setGuestPersistence = (enabled: boolean) => {
    guestPersistence = enabled;
};
store.subscribe(() => {
    if (guestPersistence) {
        try {
            localStorage.setItem(
                GUEST_KEY,
                JSON.stringify({ version: 1, ...store.getState() }),
            );
        } catch {
            /* Guest play still works when browser storage is disabled. */
        }
    }
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const selectEcts = (state: RootState) =>
    calculateEcts(state.progress.completedGameIds);
export const selectYearComplete = (state: RootState, year: Year) =>
    isYearComplete(year, state.progress.completedGameIds);
export const selectYearUnlocked = (state: RootState, index: number) =>
    isYearUnlocked(index, state.progress.completedGameIds);
export const selectCanGraduate = (state: RootState) =>
    canGraduate(state.progress.completedGameIds);
