export type Gender = "unspecified" | "female" | "male" | "nonbinary";
export type Glasses = "none" | "glasses" | "sunglasses";
export type HairLength = "short" | "long";
export type Character = {
    hairColor: string;
    skinColor: string;
    eyeColor: string;
    gender: Gender;
    glasses: Glasses;
    hairLength: HairLength;
};
export type OnboardingStage = "welcome" | "builder" | "acceptance" | "main";
export type Player = {
    name: string;
    character: Character;
    major: string;
    onboardingStage: OnboardingStage;
};
export type Progress = {
    completedGameIds: string[];
    // Game id → 0–100 result. A completed game without one pays its full ECTS.
    scores: Record<string, number>;
    graduated: boolean;
    graduatedAt?: string | null;
};
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
    onComplete: (score: number) => void; // 0–100: scales the year's ECTS
    onExit: () => void;
};
