// The trigger calibration before the warm-up (docs/SHOOTER_CV.md → Trigger calibration), as a
// pure state machine: the scene feeds it time, whether the hand is in view, the engine's replies
// and shots, and shows its instruction. The engine measures the fingertip gap; this only paces the steps.

import {
    TRIGGER_MAX_ATTEMPTS,
    TRIGGER_RETRY_MS,
    TRIGGER_STEPS,
    TRIGGER_TEST_SHOTS,
} from "./config";
import type { CvTriggerReply, TriggerStep } from "./input/cvStream";
import { fill, TEXT } from "../src/misc/text";

const T = TEXT.shooter.pinchCheck;

type State =
    | { kind: "waiting" } // for the hand to be in view
    | { kind: "step"; index: number; msLeft: number }
    | { kind: "computing" } // "done" sent, waiting for the engine
    | { kind: "failed"; detail: string; msLeft: number }
    | { kind: "testing"; shots: number }
    | { kind: "finished"; usedDefault: boolean };

export class TriggerCalibration {
    private state: State = { kind: "waiting" };
    private attempts = 0;

    get isFinished(): boolean {
        return this.state.kind === "finished";
    }

    /** True when it ended without a calibrated trigger (gave up, or skipped). */
    get usedDefault(): boolean {
        return this.state.kind === "finished" && this.state.usedDefault;
    }

    /** Advances time; returns a step to send to the engine, if any. Steps only run while the
     * hand is in view, so a hand that drops out doesn't spoil the measurement. */
    update(deltaMs: number, isHandReady: boolean): TriggerStep | null {
        const state = this.state;
        if (state.kind === "waiting") {
            if (!isHandReady) return null;
            return this.startStep(0);
        }
        if (state.kind === "step") {
            if (!isHandReady) return null;
            state.msLeft -= deltaMs;
            if (state.msLeft > 0) return null;
            if (state.index + 1 < TRIGGER_STEPS.length)
                return this.startStep(state.index + 1);
            this.state = { kind: "computing" };
            return "done";
        }
        if (state.kind === "failed") {
            state.msLeft -= deltaMs;
            if (state.msLeft <= 0) this.state = { kind: "waiting" };
        }
        return null;
    }

    handleReply(reply: CvTriggerReply) {
        if (reply.step !== "done" || this.state.kind !== "computing") return;
        if (reply.ok) {
            this.state = { kind: "testing", shots: 0 };
            return;
        }
        this.attempts += 1;
        this.state =
            this.attempts >= TRIGGER_MAX_ATTEMPTS
                ? { kind: "finished", usedDefault: true }
                : {
                      kind: "failed",
                      detail: reply.detail ?? T.retryReason,
                      msLeft: TRIGGER_RETRY_MS,
                  };
    }

    /** A shot fired. Counts (true) only in the test after a successful calibration. */
    handleShot(): boolean {
        if (this.state.kind !== "testing") return false;
        this.state.shots += 1;
        if (this.state.shots >= TRIGGER_TEST_SHOTS)
            this.state = { kind: "finished", usedDefault: false };
        return true;
    }

    skip() {
        if (this.state.kind !== "finished")
            this.state = {
                kind: "finished",
                usedDefault: this.state.kind !== "testing",
            };
    }

    instruction(): string {
        const state = this.state;
        switch (state.kind) {
            case "waiting":
                return T.waiting;
            case "step":
                return TRIGGER_STEPS[state.index].text;
            case "computing":
                return T.measuring;
            case "failed":
                return fill(T.failed, { detail: state.detail });
            case "testing":
                return fill(
                    TRIGGER_TEST_SHOTS - state.shots === 1
                        ? T.testing.one
                        : T.testing.other,
                    { count: TRIGGER_TEST_SHOTS - state.shots },
                );
            case "finished":
                return "";
        }
    }

    private startStep(index: number): TriggerStep {
        this.state = { kind: "step", index, msLeft: TRIGGER_STEPS[index].ms };
        return TRIGGER_STEPS[index].step;
    }
}
