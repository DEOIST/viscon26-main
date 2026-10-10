// Per-career art and jokes for the diploma. The career itself is decided elsewhere:
// services/endings.py (runs) and config.ts endingFor() (the year shell), from the shared tiers.

import type { EndingId } from "./CommonInt";
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
        alt: "A researcher filling a giant blackboard with formulas",
        focus: "50% 50%",
        stamp: "Summa cum laude",
        caption:
            "Turns out counting cards at casino night was a transferable skill.",
        salary: "CHF 400k + a bonus nobody can explain",
        housing: "Penthouse in Zug, tax-optimised",
    },
    phd: {
        image: phdUrl,
        alt: "A grinning graduate wearing a doctoral hat built from pizza boxes",
        focus: "50% 0%",
        stamp: "Magna cum laude",
        caption:
            "Your doctoral hat is 80 % pizza box. Your thesis is 80 % done. Since 2029.",
        salary: "CHF 47k and unlimited Mensa coffee",
        housing: "Your office desk, after 22:00",
    },
    masters: {
        image: mastersUrl,
        alt: "Two students walking down the steps of the ETH main building",
        focus: "50% 65%",
        stamp: "Cum laude",
        caption:
            "You left the main building for 4 minutes, then enrolled for a Master's.",
        salary: "Negative (semester fees)",
        housing: "Same WG, same broken dishwasher",
    },
    mcdonalds: {
        image: mcdonaldsUrl,
        alt: "A cat in a fast-food uniform and headset serving a burger",
        focus: "50% 25%",
        stamp: "Cum fries",
        caption:
            "Your new manager is a cat. It is still more organised than your study group.",
        salary: "CHF 24/h + all the fries you can carry",
        housing: "Staff room at Zürich HB",
    },
    homeless: {
        image: homelessUrl,
        alt: "A person crouching against a wall, holding up a cardboard sign that says HELP",
        focus: "50% 50%",
        stamp: "Sine domo",
        caption:
            "400 flat applications, zero viewings. The cardboard CV is getting traction.",
        salary: "Exposure",
        housing: "Waiting list position 4,127",
    },
};
