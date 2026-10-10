// Player-facing text lives in shared/text.json, so copy can be edited without touching code.
// The import is typed, so a renamed or missing key fails the typecheck instead of the game.
import text from "../../../shared/text.json";

export const TEXT = text;

/** Fills `{name}` placeholders: fill("Hi {name}", { name: "Ada" }) gives "Hi Ada". */
export function fill(
    template: string,
    values: Record<string, string | number>,
): string {
    return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
        key in values ? String(values[key]) : placeholder,
    );
}

/** Fills the same placeholders into every line of a dialogue pack, keeping its events. */
export function fillLines<Event extends string>(
    lines: Record<Event, string[]>,
    values: Record<string, string | number>,
): Record<Event, string[]> {
    return Object.fromEntries(
        Object.entries<string[]>(lines).map(([event, eventLines]) => [
            event,
            eventLines.map((line) => fill(line, values)),
        ]),
    ) as Record<Event, string[]>;
}
