// What the committee says. Built in, like the dealer's fallback lines: this level has no
// server side, so it never waits for (or spends) an AI call. The text itself is in
// shared/text.json (thesisDefense.committeeLines).

import { fillLines, TEXT } from "../src/misc/text";

export type CommitteeEvent =
    | "intro"
    | "miss"
    | "stray"
    | "streak"
    | "meltdown"
    | "final"
    | "eureka"
    | "failed"
    | "passed";

export function committeeLines(name: string): Record<CommitteeEvent, string[]> {
    return fillLines<CommitteeEvent>(TEXT.thesisDefense.committeeLines, {
        name,
    });
}
