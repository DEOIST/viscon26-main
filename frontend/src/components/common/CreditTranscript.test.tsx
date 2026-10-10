import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GAMES, TOTAL_ECTS } from "../../config";
import { creditSummary } from "../../misc/credits";
import { TEXT } from "../../misc/text";
import CreditTranscript from "./CreditTranscript";

afterEach(cleanup);

it("shows every game's share, the sum and what it leads to", () => {
    const year1 = GAMES[0];
    const summary = creditSummary([year1.id], { [year1.id]: 75 });
    render(<CreditTranscript summary={summary} />);
    expect(screen.getByText("75 %")).toBeTruthy();
    expect(screen.getByText(`45 / ${year1.ects}`)).toBeTruthy();
    expect(screen.getAllByText(`45 / ${TOTAL_ECTS} ECTS`)).toHaveLength(2); // header + sum
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("45");
    expect(screen.getByText(TEXT.credits.onTrack)).toBeTruthy();
    expect(screen.getAllByText(summary.ending.title).length).toBeGreaterThan(0);
    expect(
        screen.getByText(
            `${summary.next!.ectsNeeded} more ECTS for ${summary.next!.title}`,
        ),
    ).toBeTruthy();
});

it("says what the player became once the degree is done", () => {
    const ids = GAMES.map((game) => game.id);
    render(
        <CreditTranscript
            final
            summary={creditSummary(
                ids,
                Object.fromEntries(ids.map((id) => [id, 90])),
            )}
        />,
    );
    expect(screen.getByText(TEXT.credits.becomes)).toBeTruthy();
    expect(screen.queryByText(/more ECTS for/)).toBeNull();
});
