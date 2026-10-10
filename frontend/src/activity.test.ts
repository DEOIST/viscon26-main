import { describe, expect, it } from "vitest";
import { activityLevel, buildWeeks, GRAPH_WEEKS, monthLabel } from "./activity";

describe("activity graph", () => {
    it("lays out a year of Monday-first weeks that ends today", () => {
        // 2026-10-10 is a Saturday.
        const weeks = buildWeeks("2026-10-10", [
            { day: "2026-10-10", attempts: 4 },
            { day: "2026-10-05", attempts: 1 },
            { day: "2020-01-01", attempts: 9 }, // outside the graph, ignored
        ]);
        expect(weeks).toHaveLength(GRAPH_WEEKS);
        expect(weeks.every((week) => week.length === 7)).toBe(true);
        const last = weeks[GRAPH_WEEKS - 1];
        expect(last[0]).toEqual({
            day: "2026-10-05",
            attempts: 1,
            future: false,
        });
        expect(last[5]).toEqual({
            day: "2026-10-10",
            attempts: 4,
            future: false,
        });
        expect(last[6]).toEqual({
            day: "2026-10-11",
            attempts: 0,
            future: true,
        });
        expect(weeks[0][0].day).toBe("2025-10-06"); // a Monday, 52 weeks earlier
        const days = weeks.flat().map((cell) => cell.day);
        expect(new Set(days).size).toBe(days.length); // no gaps, no repeats
    });

    it("keeps the time zone out of the day math", () => {
        // A Sunday today means the last column is full and nothing is in the future.
        const last = buildWeeks("2026-10-11", []).at(-1)!;
        expect(last.map((cell) => cell.future)).toEqual(Array(7).fill(false));
        expect(last[6].day).toBe("2026-10-11");
    });

    it("uses fixed intensity steps", () => {
        expect([0, 1, 2, 3, 5, 6, 9, 10, 50].map(activityLevel)).toEqual([
            0, 1, 1, 2, 2, 3, 3, 4, 4,
        ]);
    });

    it("labels the first week of each month once", () => {
        const weeks = buildWeeks("2026-10-10", []);
        const labels = weeks.map((_, index) => monthLabel(weeks, index));
        // October 2025 opens the graph and October 2026 closes it.
        expect(labels.filter(Boolean)).toHaveLength(13);
        expect([labels[0], labels.at(-1)]).toEqual(["Oct", "Oct"]);
        // A lone last week of a month in the first column would crowd the next label.
        const late = buildWeeks("2026-10-28", []);
        expect(late[0][0].day).toBe("2025-10-27");
        expect(monthLabel(late, 0)).toBe("");
        expect(monthLabel(late, 1)).toBe("Nov");
    });
});
