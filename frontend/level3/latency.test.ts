import { describe, expect, it } from "vitest";
import { loadOffset, median, saveOffset, suggestOffset } from "./latency";

function memory(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => {
            data[key] = value;
        },
    };
}

const lateBy = (ms: number, n = 20) =>
    Array.from({ length: n }, (_, i) => ms + ((i % 5) - 2) * 6); // ± 12 ms of human spread

describe("timing calibration", () => {
    it("finds the middle of a run's hits", () => {
        expect(median([3, -1, 10])).toBe(3);
        expect(median([4, 1, 2, 9])).toBe(3);
    });

    it("suggests shifting presses by how late a run's hits landed", () => {
        // Bluetooth headphones that hide 40 ms of delay: on-beat presses land 40 ms late.
        expect(suggestOffset(lateBy(40), 0)).toEqual({
            lean: 40,
            suggested: 40,
        });
        expect(suggestOffset(lateBy(-25), 0)).toEqual({
            lean: -25,
            suggested: -25,
        });
    });

    it("builds on the offset the run was judged with", () => {
        // Tuned to 40 ms, the next run still leans 15 ms late: tune to 55.
        expect(suggestOffset(lateBy(15), 40)).toEqual({
            lean: 15,
            suggested: 55,
        });
    });

    it("stays quiet without enough hits or a clear lean", () => {
        expect(suggestOffset(lateBy(40, 11), 0)).toBeNull(); // too few hits
        expect(suggestOffset(lateBy(6), 0)).toBeNull(); // within a human's own spread
    });

    it("caps the offset", () => {
        expect(suggestOffset(lateBy(200), 200)?.suggested).toBe(250);
    });

    it("remembers the offset in this browser and survives bad or missing storage", () => {
        const storage = memory();
        expect(loadOffset(storage)).toBe(0);
        saveOffset(storage, 37.4);
        expect(loadOffset(storage)).toBe(37);
        expect(
            loadOffset(memory({ "eth-life:thesis-defense:offset": "garbage" })),
        ).toBe(0);
        expect(
            loadOffset(memory({ "eth-life:thesis-defense:offset": "9999" })),
        ).toBe(250);
        const broken = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        };
        expect(loadOffset(broken)).toBe(0);
        expect(() => saveOffset(broken, 20)).not.toThrow();
    });
});
