// The dealer's built-in lines, used when the shell passes no dialogue pack or the pack has no
// line for an event. The keys are this level's dialogue events (EVENTS in
// backend/level2/dialogue.py), which the story API fills in for this player. The text itself is
// in shared/text.json (blackjack.dealerLines).

import { fillLines, TEXT } from "../src/misc/text";

export type DealerEvent =
    | "intro"
    | "deal"
    | "playerBlackjack"
    | "playerBust"
    | "dealerBust"
    | "win"
    | "lose"
    | "push"
    | "broke"
    | "cashOut";

export function builtInLines(
    playerName: string,
): Record<DealerEvent, string[]> {
    return fillLines<DealerEvent>(TEXT.blackjack.dealerLines, {
        name: playerName,
    });
}
