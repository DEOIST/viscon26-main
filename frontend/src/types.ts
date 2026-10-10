export type Gender = "unspecified" | "female" | "male" | "nonbinary";
export type Glasses = "none" | "glasses" | "sunglasses";
export type Character = {
    hairColor: string;
    skinColor: string;
    eyeColor: string;
    gender: Gender;
    glasses: Glasses;
};
export type OnboardingStage = "welcome" | "builder" | "acceptance" | "main";
export type Player = {
    name: string;
    character: Character;
    major: string;
    onboardingStage: OnboardingStage;
};
export type Progress = { completedGameIds: string[]; graduated: boolean };
export type Snapshot = { player: Player; progress: Progress };
export type Game = {
    id: string;
    title: string;
    ects: number;
    implemented: boolean;
};
export type Year = {
    id: number;
    title: string;
    description: string;
    ects: number;
    games: Game[];
};

/** The entire integration surface. Minigames never need to import the store. */
export type MinigameProps = {
    gameId: string;
    playerName: string;
    character: Character;
    major: string;
    ectsPoints: number;
    completedGameIds: string[];
    onComplete: () => void;
    onExit: () => void;
};
