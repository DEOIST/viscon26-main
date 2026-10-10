// The shooter's input lifecycle against a fake browser: camera, video element and WebSocket.
// Frame encoding is covered by FramePacer's tests and the browser checks in docs/SHOOTER_CV.md.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SwitchableInput from "./SwitchableInput";

class FakeTrack extends EventTarget {
    isStopped = false;
    stop() {
        this.isStopped = true;
    }
}

class FakeSocket {
    static readonly OPEN = 1;
    static instances: FakeSocket[] = [];
    readyState = 1;
    binaryType = "blob";
    sent: unknown[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    readonly url: string;

    constructor(url: string) {
        this.url = url;
        FakeSocket.instances.push(this);
    }

    send(data: unknown) {
        this.sent.push(data);
    }

    close() {
        this.readyState = 3;
    }

    receive(message: object) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    closeFromServer(code: number, reason = "") {
        this.readyState = 3;
        this.onclose?.({ code, reason });
    }

    sentMessages(): Record<string, unknown>[] {
        return this.sent.map((data) => JSON.parse(String(data)));
    }
}

interface FakeVideo {
    style: Record<string, string>;
    videoWidth: number;
    videoHeight: number;
    play(): Promise<void>;
    remove(): void;
    requestVideoFrameCallback(): void;
}

let videos: FakeVideo[] = [];
let playVideo: () => Promise<void> = () => Promise.resolve();
let keydown: ((event: { key: string }) => void) | null = null;

function fakeVideo(): FakeVideo {
    const video = {
        style: {},
        videoWidth: 640,
        videoHeight: 480,
        play: () => playVideo(),
        remove: vi.fn(),
        requestVideoFrameCallback: vi.fn(),
    };
    videos.push(video);
    return video;
}

function fakeParent(): HTMLElement {
    const parent = {
        style: { cursor: "" },
        prepend: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    return parent as unknown as HTMLElement;
}

function useCamera(getUserMedia: (() => Promise<unknown>) | null) {
    vi.stubGlobal(
        "navigator",
        getUserMedia ? { mediaDevices: { getUserMedia } } : {},
    );
}

function cameraStream(track: FakeTrack) {
    return { getTracks: () => [track], getVideoTracks: () => [track] };
}

// Lets pending promise callbacks (getUserMedia, play) run.
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    FakeSocket.instances = [];
    videos = [];
    playVideo = () => Promise.resolve();
    keydown = null;
    vi.stubGlobal("window", {
        location: { href: "http://localhost:8000/shooter?run=abc" },
        addEventListener: (type: string, listener: typeof keydown) => {
            if (type === "keydown") keydown = listener;
        },
        removeEventListener: vi.fn(),
        setTimeout,
    });
    vi.stubGlobal("document", {
        createElement: (tag: string) => (tag === "video" ? fakeVideo() : {}),
    });
    vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("SwitchableInput", () => {
    it("falls back to the mouse when the page may not use the camera", async () => {
        useCamera(null); // http://<vm-ip>: no navigator.mediaDevices at all

        const input = new SwitchableInput(fakeParent(), null);
        await settle();

        expect(input.mode).toBe("mouse");
        expect(input.notice).toBe(
            "Mouse mode: the camera needs https:// or localhost",
        );
    });

    it("streams to the engine once the camera runs", async () => {
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));

        const input = new SwitchableInput(fakeParent(), null);
        await settle();

        expect(input.mode).toBe("camera");
        expect(FakeSocket.instances.map((socket) => socket.url)).toEqual([
            "ws://localhost:8000/api/cv/stream",
        ]);
    });

    it("fits the engine's box to a 4:3 camera, then sends the perk", async () => {
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));
        new SwitchableInput(fakeParent(), 175);
        await settle();
        const socket = FakeSocket.instances[0];

        socket.receive({ type: "ready", box: [0.2, 0.15, 0.8, 0.75] });
        const [request] = socket.sentMessages();
        socket.receive({ type: "ready", box: request.box });

        expect(request.type).toBe("box");
        expect((request.box as number[])[1]).toBeCloseTo(0.225);
        expect((request.box as number[])[3]).toBeCloseTo(0.675);
        expect(socket.sentMessages()).toHaveLength(2);
        expect(socket.sentMessages()[1]).toEqual({
            type: "settings",
            cooldownMs: 175,
        });
    });

    it("reports aim, tracking and each shot once", async () => {
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));
        const input = new SwitchableInput(fakeParent(), null);
        await settle();

        FakeSocket.instances[0].receive({
            type: "frame",
            tracking: "ok",
            aim: [0.5, 0.4],
            firedAt: [0.45, 0.4],
            landmarks: null,
            thumbAngle: 20,
            processingMs: 9,
        });

        expect(input.tracking).toBe("ok");
        expect(input.aim).toEqual({ x: 0.5, y: 0.4 });
        expect(input.takeShots()).toEqual([{ x: 0.45, y: 0.4 }]);
        expect(input.takeShots()).toEqual([]);
    });

    it("keeps the camera image invisible: the game draws its own backdrop", async () => {
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));
        new SwitchableInput(fakeParent(), null);
        await settle();

        expect(videos[0].style).toMatchObject({ opacity: "0", width: "1px" });
    });

    it("starts and stops a recording with R once the engine confirms it", async () => {
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));
        const input = new SwitchableInput(fakeParent(), null);
        await settle();
        const socket = FakeSocket.instances[0];

        keydown?.({ key: "r" });
        expect(input.recording).toBe(false); // not until the engine says so
        socket.receive({ type: "record", on: true, dir: "/tmp/captures/1" });
        expect(input.recording).toBe(true);
        keydown?.({ key: "R" });
        socket.receive({ type: "record", on: false, dir: null });

        expect(input.recording).toBe(false);
        expect(socket.sentMessages()).toEqual([
            { type: "record", on: true },
            { type: "record", on: false },
        ]);
    });

    it("asks the engine to recalibrate the aim with C", async () => {
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));
        new SwitchableInput(fakeParent(), null);
        await settle();

        keydown?.({ key: "c" });

        expect(FakeSocket.instances[0].sentMessages()).toEqual([
            { type: "recenter" },
        ]);
    });

    it("falls back to the mouse when the camera is unplugged", async () => {
        const track = new FakeTrack();
        useCamera(() => Promise.resolve(cameraStream(track)));
        const input = new SwitchableInput(fakeParent(), null);
        await settle();

        track.dispatchEvent(new Event("ended"));

        expect(input.mode).toBe("mouse");
        expect(input.notice).toBe("Mouse mode: the camera was disconnected");
        expect(FakeSocket.instances[0].readyState).toBe(3);
    });

    it("falls back to the mouse when the engine is busy", async () => {
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));
        const input = new SwitchableInput(fakeParent(), null);
        await settle();

        FakeSocket.instances[0].closeFromServer(1013);

        expect(input.mode).toBe("mouse");
        expect(input.notice).toBe(
            "Mouse mode: the finger-detection engine is busy",
        );
    });

    it("lets the operator switch to the mouse with M, releasing camera and stream", async () => {
        const track = new FakeTrack();
        useCamera(() => Promise.resolve(cameraStream(track)));
        const input = new SwitchableInput(fakeParent(), null);
        await settle();

        keydown?.({ key: "m" });

        expect(input.mode).toBe("mouse");
        expect(track.isStopped).toBe(true);
        expect(FakeSocket.instances[0].readyState).toBe(3);
    });

    it("opens no stream when destroyed while the camera starts", async () => {
        const track = new FakeTrack();
        let grant: (stream: unknown) => void = () => {};
        useCamera(
            () =>
                new Promise((resolve) => {
                    grant = resolve;
                }),
        );
        const input = new SwitchableInput(fakeParent(), null);

        input.destroy();
        grant(cameraStream(track));
        await settle();

        expect(FakeSocket.instances).toHaveLength(0);
        expect(track.isStopped).toBe(true);
    });

    it("opens no stream when destroyed while the video starts", async () => {
        let startVideo: () => void = () => {};
        playVideo = () =>
            new Promise((resolve) => {
                startVideo = resolve;
            });
        useCamera(() => Promise.resolve(cameraStream(new FakeTrack())));
        const input = new SwitchableInput(fakeParent(), null);
        await settle();

        input.destroy();
        startVideo();
        await settle();

        expect(FakeSocket.instances).toHaveLength(0);
        expect(videos[0].remove).toHaveBeenCalled();
    });
});
