import { describe, expect, it } from "vitest";
import { cameraErrorMessage, closeMessage, cvStreamUrl } from "./cvStream";

describe("cvStreamUrl", () => {
    it("uses ws:// next to an http:// page and wss:// next to https://", () => {
        expect(cvStreamUrl("http://localhost:8000/shooter?run=abc")).toBe(
            "ws://localhost:8000/api/cv/stream",
        );
        expect(cvStreamUrl("https://ethlife.example.org/shooter")).toBe(
            "wss://ethlife.example.org/api/cv/stream",
        );
    });
});

describe("closeMessage", () => {
    it("explains the engine's close codes", () => {
        expect(closeMessage(1013, "")).toBe(
            "the finger-detection engine is busy",
        );
        expect(closeMessage(1011, "Hand model missing")).toBe(
            "Hand model missing",
        );
        expect(closeMessage(1011, "")).toBe(
            "the finger-detection engine is unavailable",
        );
        expect(closeMessage(4000, "No camera frames for a while")).toBe(
            "the camera stopped sending frames",
        );
        expect(closeMessage(1006, "")).toBe(
            "the connection to the finger-detection engine was lost",
        );
    });
});

describe("cameraErrorMessage", () => {
    it("turns camera errors into something a player understands", () => {
        const denied = new DOMException("x", "NotAllowedError");
        const missing = new DOMException("x", "NotFoundError");
        const busy = new DOMException("x", "NotReadableError");

        expect(cameraErrorMessage(denied)).toBe("camera permission was denied");
        expect(cameraErrorMessage(missing)).toBe("no camera was found");
        expect(cameraErrorMessage(busy)).toBe(
            "the camera is in use by another app",
        );
        expect(cameraErrorMessage(new Error("boom"))).toBe("boom");
    });
});
