import { expect, it } from "vitest";
import { fill, fillLines, TEXT } from "./text";

it("fills every placeholder, including repeated ones", () => {
    expect(
        fill("{name}, meet {name}. {ects} ECTS.", { name: "Ada", ects: 60 }),
    ).toBe("Ada, meet Ada. 60 ECTS.");
});

it("leaves a placeholder without a value visible instead of dropping it", () => {
    expect(fill("Hi {name}", {})).toBe("Hi {name}");
});

it("fills dialogue packs line by line and keeps their events", () => {
    const lines = fillLines(
        { intro: ["Hello {name}.", "Sit down."], end: ["Bye {name}."] },
        { name: "Ada" },
    );
    expect(lines).toEqual({
        intro: ["Hello Ada.", "Sit down."],
        end: ["Bye Ada."],
    });
});

it("gives every dialogue event at least one line", () => {
    for (const pack of [
        TEXT.blackjack.dealerLines,
        TEXT.thesisDefense.committeeLines,
    ])
        for (const lines of Object.values(pack))
            expect(lines.length).toBeGreaterThan(0);
});
