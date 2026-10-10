import { describe, expect, it } from "vitest";
import {
    TRIGGER_MAX_ATTEMPTS,
    TRIGGER_RETRY_MS,
    TRIGGER_STEPS,
    TRIGGER_TEST_SHOTS,
} from "./config";
import { TriggerCalibration } from "./triggerCalibration";
import type { CvTriggerReply } from "./input/cvStream";

const THRESHOLDS = {
    cockedBelowDeg: 20,
    firedAboveDeg: 35,
    uprightAbove: 0.8,
    foldedBelow: 0.7,
};
const done = (ok: boolean, detail: string | null = null): CvTriggerReply => ({
    type: "trigger",
    step: "done",
    ok,
    detail,
    thresholds: THRESHOLDS,
});

/** Runs all the steps with the hand in view; returns every step sent to the engine. */
function runSteps(calibration: TriggerCalibration) {
    const sent = [calibration.update(16, true)];
    for (const { ms } of TRIGGER_STEPS) sent.push(calibration.update(ms, true));
    return sent;
}

describe("trigger calibration", () => {
    it("sends up, down, up, down, then done", () => {
        expect(runSteps(new TriggerCalibration())).toEqual([
            ...TRIGGER_STEPS.map((s) => s.step),
            "done",
        ]);
    });

    it("waits for the finger gun and pauses while it is out of view", () => {
        const calibration = new TriggerCalibration();
        expect(calibration.update(5000, false)).toBeNull();
        expect(calibration.instruction()).toMatch(/show your finger gun/);
        expect(calibration.update(16, true)).toBe("up");
        // Time without the hand doesn't count toward the step
        expect(calibration.update(TRIGGER_STEPS[0].ms * 2, false)).toBeNull();
        expect(calibration.instruction()).toBe(TRIGGER_STEPS[0].text);
        expect(calibration.update(TRIGGER_STEPS[0].ms, true)).toBe("down");
    });

    it("tests the calibrated trigger with a few shots, then finishes", () => {
        const calibration = new TriggerCalibration();
        runSteps(calibration);
        expect(calibration.handleShot()).toBe(false); // not counted while measuring
        calibration.handleReply(done(true));
        expect(calibration.instruction()).toMatch(/Calibrated/);
        for (let i = 0; i < TRIGGER_TEST_SHOTS; i++)
            expect(calibration.handleShot()).toBe(true);
        expect(calibration.isFinished).toBe(true);
        expect(calibration.usedDefault).toBe(false);
    });

    it("shows why it failed, retries, and gives up on the default trigger", () => {
        const calibration = new TriggerCalibration();
        for (let attempt = 1; attempt <= TRIGGER_MAX_ATTEMPTS; attempt++) {
            runSteps(calibration);
            calibration.handleReply(done(false, "Drop it further"));
            if (attempt < TRIGGER_MAX_ATTEMPTS) {
                expect(calibration.instruction()).toMatch(/^Drop it further/);
                calibration.update(TRIGGER_RETRY_MS, true); // back to waiting
            }
        }
        expect(calibration.isFinished).toBe(true);
        expect(calibration.usedDefault).toBe(true);
    });

    it("can be skipped at any time", () => {
        const calibration = new TriggerCalibration();
        calibration.update(16, true);
        calibration.skip();
        expect(calibration.isFinished).toBe(true);
        expect(calibration.usedDefault).toBe(true);
        expect(calibration.update(1000, true)).toBeNull();
    });
});
