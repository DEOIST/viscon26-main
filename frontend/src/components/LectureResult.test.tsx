import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LectureResult from "./LectureResult";
import { playGaugeSound } from "../gaugeSound";

const stopSound = vi.hoisted(() => vi.fn());
vi.mock("../gaugeSound", () => ({
    playGaugeSound: vi.fn(() => stopSound),
}));
const play = vi.mocked(playGaugeSound);

beforeEach(() => {
    play.mockClear();
    stopSound.mockClear();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("plays the gauge's sound when a result appears, at the needle's reading", () => {
    render(<LectureResult earned={45} ects={60} score={75} />);
    expect(play).toHaveBeenCalledOnce();
    expect(play.mock.calls[0][0]).toBe(0.75);
    expect(play.mock.calls[0][1]).toEqual({
        delayMs: 150,
        sweepMs: 1100,
        easing: [0.3, 1.35, 0.5, 1],
    });
});

it("plays it again whenever the gauge animates again, not only the first time", () => {
    // Moving between two finished years keeps the gauge mounted and hands it a new result.
    const view = render(<LectureResult earned={45} ects={60} score={75} />);
    view.rerender(<LectureResult earned={15} ects={60} score={25} />);
    expect(stopSound).toHaveBeenCalledOnce(); // the first sweep's sound is cut, not layered
    expect(play).toHaveBeenCalledTimes(2);
    expect(play.mock.calls[1][0]).toBe(0.25);

    // Coming back to a result mounts a fresh gauge: its needle sweeps, so it sounds again.
    view.unmount();
    render(<LectureResult earned={15} ects={60} score={25} />);
    expect(play).toHaveBeenCalledTimes(3);
});

it("stays quiet while nothing animates", () => {
    const view = render(<LectureResult earned={45} ects={60} score={75} />);
    view.rerender(<LectureResult earned={45} ects={60} score={75} />);
    expect(play).toHaveBeenCalledOnce();
    expect(stopSound).not.toHaveBeenCalled();
});

it("stops the sound when the gauge leaves mid-sweep", () => {
    const view = render(<LectureResult earned={60} ects={60} score={100} />);
    view.unmount();
    expect(stopSound).toHaveBeenCalledOnce();
});

it("plays no sound when reduced motion shows the result at once", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<LectureResult earned={45} ects={60} score={75} />);
    expect(play).not.toHaveBeenCalled();
});
