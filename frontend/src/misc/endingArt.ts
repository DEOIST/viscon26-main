// Per-career art and jokes for the diploma. The career itself is decided elsewhere:
// services/endings.py (runs) and config.ts endingFor() (the year shell), from the shared tiers.

import type { EndingId } from "./CommonInt";
import { TEXT } from "./text";
import quantUrl from "../assets/endings/quant.jpg";
import phdUrl from "../assets/endings/phd.jpg";
import mastersUrl from "../assets/endings/masters.jpg";
import mcdonaldsUrl from "../assets/endings/mcdonalds.jpeg";
import homelessUrl from "../assets/endings/homeless.jpg";

export interface EndingArt {
    image: string;
    alt: string;
    // object-position keeping the joke in frame when the photo is cropped
    focus: string;
    stamp: string;
    caption: string;
    salary: string;
    housing: string;
}

export const ENDING_ART: Record<EndingId, EndingArt> = {
    quant: {
        image: quantUrl,
        focus: "50% 50%",
        ...TEXT.endings.quant,
    },
    phd: {
        image: phdUrl,
        focus: "50% 0%",
        ...TEXT.endings.phd,
    },
    masters: {
        image: mastersUrl,
        focus: "50% 65%",
        ...TEXT.endings.masters,
    },
    mcdonalds: {
        image: mcdonaldsUrl,
        focus: "50% 25%",
        ...TEXT.endings.mcdonalds,
    },
    homeless: {
        image: homelessUrl,
        focus: "50% 50%",
        ...TEXT.endings.homeless,
    },
};
