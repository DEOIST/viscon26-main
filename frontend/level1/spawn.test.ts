import { describe, expect, it } from "vitest";
import { pickTargetKind, spawnIntervalMs } from "./spawn";
import { SPAWN_EVERY_MS_END, SPAWN_EVERY_MS_START } from "./config";

describe("pickTargetKind", () => {
    it("spawns 70 % questions, 20 % deadlines and 10 % coffee", () => {
        expect(pickTargetKind(0)).toBe("question");
        expect(pickTargetKind(0.69)).toBe("question");
        expect(pickTargetKind(0.7)).toBe("deadline");
        expect(pickTargetKind(0.89)).toBe("deadline");
        expect(pickTargetKind(0.9)).toBe("coffee");
        expect(pickTargetKind(0.999)).toBe("coffee");
    });
});

describe("spawnIntervalMs", () => {
    it("speeds up from the start rate to the end rate over the round", () => {
        expect(spawnIntervalMs(0)).toBe(SPAWN_EVERY_MS_START);
        expect(spawnIntervalMs(1)).toBe(SPAWN_EVERY_MS_END);
        expect(spawnIntervalMs(0.5)).toBe(
            (SPAWN_EVERY_MS_START + SPAWN_EVERY_MS_END) / 2,
        );
    });

    it("stays at the end rate after the round's length (coffee adds time)", () => {
        expect(spawnIntervalMs(1.4)).toBe(SPAWN_EVERY_MS_END);
    });
});
