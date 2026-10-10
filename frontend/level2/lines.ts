// The dealer's built-in lines, used when the shell passes no dialogue pack or the pack has no
// line for an event. The keys are this level's dialogue events (EVENTS in
// backend/level2/dialogue.py), which the story API fills in for this player.

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
    return {
        intro: [
            `Welcome to casino night, ${playerName}. Mind the red balls.`,
            "Place your bet. The curve is watching.",
        ],
        deal: ["Cards out, balls rolling.", "Let's see where they land."],
        playerBlackjack: [
            "Three yellow! Blackjack pays 3 to 2.",
            "Right on the curve, three times. Impressive.",
        ],
        playerBust: [
            "A red ball. That's a bust.",
            "Over the curve. The house thanks you.",
        ],
        dealerBust: [
            "Red on my board. You win this one.",
            "I went over the curve. Enjoy it.",
        ],
        win: ["More balls than me. Well played.", "You win this hand."],
        lose: [
            "The house takes this one.",
            "My board wins. Better luck next hand.",
        ],
        push: ["Same count. Your bet comes back.", "A tie. Nobody moves."],
        broke: [
            `Out of chips, ${playerName}. Welcome to student life.`,
            "The stipend is gone.",
        ],
        cashOut: [
            "Leaving ahead of the house. That is rare.",
            "Last hand played and still in profit. Respect.",
        ],
    };
}
