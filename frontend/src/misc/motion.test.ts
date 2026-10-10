import { afterEach, expect, it, vi } from "vitest";
import { PresentationTimeline } from "./motion";

afterEach(() => vi.useRealTimers());

it("skip resolves coordinated waits and clears their timers", async () => {
    vi.useFakeTimers();
    const timeline = new PresentationTimeline();
    const pending = [timeline.wait(780), timeline.wait(350)];
    expect(vi.getTimerCount()).toBe(2);
    timeline.skip();
    await Promise.all(pending);
    expect(vi.getTimerCount()).toBe(0);
    expect(timeline.active).toBe(true);
    expect(timeline.skipped).toBe(true);
});

it("disposing an unmounted sequence clears all pending work", async () => {
    vi.useFakeTimers();
    const timeline = new PresentationTimeline();
    const pending = timeline.wait(780);
    timeline.dispose();
    await pending;
    expect(timeline.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});
