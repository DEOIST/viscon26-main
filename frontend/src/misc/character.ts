// Display data for characters, games and endings. The ids are the contract (CommonInt.ts); the
// labels and perk texts are presentation and live here. Keep in sync with docs/GAME_DESIGN.md.

import type {
    ArchetypeId,
    DepartmentId,
    EndingId,
    GameId,
    Pronouns,
} from "./CommonInt";

export const DEPARTMENTS: Record<DepartmentId, string> = {
    arch: "Architecture (D-ARCH)",
    baug: "Civil, Environmental and Geomatic Engineering (D-BAUG)",
    biol: "Biology (D-BIOL)",
    bsse: "Biosystems Science and Engineering (D-BSSE)",
    chab: "Chemistry and Applied Biosciences (D-CHAB)",
    erdw: "Earth Sciences (D-ERDW)",
    gess: "Humanities, Social and Political Sciences (D-GESS)",
    hest: "Health Sciences and Technology (D-HEST)",
    infk: "Computer Science (D-INFK)",
    itet: "Information Technology and Electrical Engineering (D-ITET)",
    math: "Mathematics (D-MATH)",
    matl: "Materials (D-MATL)",
    mavt: "Mechanical and Process Engineering (D-MAVT)",
    mtec: "Management, Technology, and Economics (D-MTEC)",
    phys: "Physics (D-PHYS)",
    usys: "Environmental Systems Science (D-USYS)",
};

export const ARCHETYPES: Record<ArchetypeId, { label: string; perk: string }> =
    {
        nerd: { label: "Nerd", perk: "Blackjack: a card-counting hint" },
        risk_taker: {
            label: "Risk-taker",
            perk: "Blackjack: start with 1 200 CHF",
        },
        gamer: { label: "Gamer", perk: "Shooter: targets 15 % larger" },
        athlete: {
            label: "ASVZ athlete",
            perk: "Shooter: trigger re-arms 30 % faster",
        },
    };

export const PRONOUN_OPTIONS: Pronouns[] = ["she", "he", "they"];

// Placeholder portraits until the generated art lands (docs/GAME_DESIGN.md → Art direction).
export const AVATARS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];

export const GAME_IDS: GameId[] = ["blackjack", "shooter"];

export const GAMES: Record<GameId, { title: string; tagline: string }> = {
    blackjack: {
        title: "Casino night",
        tagline: "Bet your semester stipend at blackjack.",
    },
    shooter: {
        title: "Basisprüfung",
        tagline: "Shoot the exam questions with your finger gun.",
    },
};

export const ENDING_TITLES: Record<EndingId, string> = {
    c_level: "C-level executive",
    big_tech: "Big-tech engineer in Zürich",
    phd: "Eternal PhD student",
    mcdonalds: "McDonald's at Zürich HB",
    unemployed: "Unemployed in a 6-person WG",
};
