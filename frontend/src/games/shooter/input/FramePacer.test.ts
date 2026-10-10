import { describe, expect, it } from "vitest";
import FramePacer from "./FramePacer";

function setup() {
    let sends = 0;
    const pacer = new FramePacer(() => {
        sends += 1;
    });
    return { pacer, sends: () => sends };
}

describe("FramePacer", () => {
    it("sends nothing until the engine is ready", () => {
        const { pacer, sends } = setup();
        pacer.cameraFrame();
        pacer.cameraFrame();
        expect(sends()).toBe(0);

        pacer.ready();
        expect(sends()).toBe(1);
    });

    it("keeps exactly one frame in flight", () => {
        const { pacer, sends } = setup();
        pacer.ready();
        pacer.cameraFrame();
        pacer.cameraFrame();
        pacer.cameraFrame();
        expect(sends()).toBe(1);
    });

    it("sends a newer camera frame as soon as the answer arrives", () => {
        const { pacer, sends } = setup();
        pacer.ready();
        pacer.cameraFrame(); // sent
        pacer.cameraFrame(); // arrives while the first is in flight
        pacer.done();
        expect(sends()).toBe(2);
    });

    it("never sends the same camera frame twice", () => {
        const { pacer, sends } = setup();
        pacer.ready();
        pacer.cameraFrame();
        pacer.done(); // no newer frame yet: wait for the camera
        expect(sends()).toBe(1);

        pacer.cameraFrame();
        expect(sends()).toBe(2);
    });

    it("frees the slot when a frame could not be sent", () => {
        const { pacer, sends } = setup();
        pacer.ready();
        pacer.cameraFrame();
        pacer.done(); // e.g. the JPEG encoder returned nothing
        pacer.cameraFrame();
        pacer.cameraFrame();
        expect(sends()).toBe(2);
    });
});
