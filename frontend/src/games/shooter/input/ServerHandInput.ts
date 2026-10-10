// The finger-detection engine's client (issue #13): webcam → small JPEG frames →
// /api/cv/stream → aim, tracking, hand landmarks and shots. FramePacer decides when the next
// frame goes out (one in flight, never the same camera frame twice). Frames are never stored.

import FramePacer from "./FramePacer";
import { FALLBACK_FRAME_MS, FRAME_WIDTH, JPEG_QUALITY } from "../config";
import { GAME_HEIGHT, GAME_WIDTH } from "../../shared/createGame";
import { boxForAspect, isSameBox } from "./box";
import { cameraErrorMessage, closeMessage, cvStreamUrl } from "./cvStream";
import type { GamePoint, Tracking } from "../../../misc/CommonInt";
import type { Box } from "./box";
import type { CvMessage } from "./cvStream";
import type { AimPoint, InputSource } from "./InputSource";

export default class ServerHandInput implements InputSource {
    readonly mode = "camera";
    aim: AimPoint | null = null;
    tracking: Tracking = "lost";
    landmarks: AimPoint[] | null = null;
    latencyMs: number | null = null; // round trip of the last frame, for the debug overlay
    private shots: AimPoint[] = [];
    private video: HTMLVideoElement | null = null;
    private stream: MediaStream | null = null;
    private socket: WebSocket | null = null;
    private readonly canvas = document.createElement("canvas");
    private readonly pacer = new FramePacer(() => this.sendFrame());
    private isDestroyed = false;
    private sentAt = 0;
    private readonly parent: HTMLElement;
    private readonly cooldownMs: number | null;
    private readonly onFailure: (reason: string) => void;

    constructor(
        parent: HTMLElement,
        cooldownMs: number | null,
        onFailure: (reason: string) => void,
    ) {
        this.parent = parent;
        this.cooldownMs = cooldownMs;
        this.onFailure = onFailure;
        void this.start();
    }

    takeShots(): AimPoint[] {
        const shots = this.shots;
        this.shots = [];
        return shots;
    }

    destroy() {
        this.isDestroyed = true;
        this.socket?.close();
        this.stopCamera();
    }

    private async start() {
        try {
            if (!navigator.mediaDevices?.getUserMedia)
                throw new Error("the camera needs https:// or localhost");
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 },
                    facingMode: "user",
                },
                audio: false,
            });
            if (this.isDestroyed) return this.stopCamera();
            this.video = createVideo(this.stream);
            this.parent.prepend(this.video);
            await this.video.play();
            if (this.isDestroyed) return; // destroy() already stopped the camera
            this.watchCamera();
            this.connect();
        } catch (error) {
            this.fail(cameraErrorMessage(error));
        }
    }

    private connect() {
        const socket = new WebSocket(cvStreamUrl(window.location.href));
        socket.binaryType = "arraybuffer";
        socket.onmessage = (event) => this.handleMessage(event.data);
        socket.onclose = (event) => {
            if (!this.isDestroyed)
                this.fail(closeMessage(event.code, event.reason));
        };
        this.socket = socket;
    }

    private handleMessage(data: unknown) {
        if (typeof data !== "string") return;
        const message = JSON.parse(data) as CvMessage;
        if (message.type === "ready") {
            this.handleReady(message.box);
        } else if (message.type === "frame") {
            this.latencyMs = performance.now() - this.sentAt;
            this.tracking = message.tracking;
            this.aim = toAim(message.aim);
            this.landmarks =
                message.landmarks?.map((point) => toAim(point)!) ?? null;
            if (message.firedAt) this.shots.push(toAim(message.firedAt)!);
            this.pacer.done();
        } else if (message.type === "error") {
            this.pacer.done();
        }
    }

    // The engine's default box doesn't know the camera's shape: ask once for a box with the game
    // area's shape (box.ts), and start streaming when the engine confirms it with another ready.
    private handleReady(box: Box) {
        const video = this.video;
        const fitted = video
            ? boxForAspect(
                  box,
                  video.videoWidth / video.videoHeight,
                  GAME_WIDTH / GAME_HEIGHT,
              )
            : box;
        if (!isSameBox(fitted, box)) {
            this.socket?.send(JSON.stringify({ type: "box", box: fitted }));
            return;
        }
        this.placeVideo(box);
        if (this.cooldownMs !== null)
            this.socket?.send(
                JSON.stringify({
                    type: "settings",
                    cooldownMs: this.cooldownMs,
                }),
            );
        this.pacer.ready();
    }

    // Tell the pacer about every new camera frame for as long as this camera runs.
    private watchCamera() {
        const video = this.video;
        if (!video) return;
        const handleFrame = () => {
            if (this.video !== video) return; // the camera was stopped
            this.pacer.cameraFrame();
            this.watchCamera();
        };
        if ("requestVideoFrameCallback" in video)
            video.requestVideoFrameCallback(handleFrame);
        else window.setTimeout(handleFrame, FALLBACK_FRAME_MS);
    }

    private sendFrame() {
        const video = this.video;
        const socket = this.socket;
        if (
            this.isDestroyed ||
            !video ||
            video.videoWidth === 0 ||
            socket?.readyState !== WebSocket.OPEN
        ) {
            this.pacer.done(); // skip this frame; the next camera frame tries again
            return;
        }
        this.canvas.width = FRAME_WIDTH;
        this.canvas.height = Math.round(
            (FRAME_WIDTH * video.videoHeight) / video.videoWidth,
        );
        this.canvas
            .getContext("2d")
            ?.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
        this.canvas.toBlob(
            (blob) => {
                if (
                    !blob ||
                    this.isDestroyed ||
                    socket.readyState !== WebSocket.OPEN
                ) {
                    this.pacer.done();
                    return;
                }
                this.sentAt = performance.now();
                void blob.arrayBuffer().then((buffer) => socket.send(buffer));
            },
            "image/jpeg",
            JPEG_QUALITY,
        );
    }

    // Scale the mirrored video so the engine's calibration box fills the game area: the
    // crosshair then sits exactly on the on-screen fingertip (docs/SHOOTER_CV.md → Aim).
    private placeVideo([x0, y0, x1, y1]: Box) {
        if (!this.video) return;
        const style = this.video.style;
        style.width = `${100 / (x1 - x0)}%`;
        style.height = `${100 / (y1 - y0)}%`;
        style.left = `${(-100 * x0) / (x1 - x0)}%`;
        style.top = `${(-100 * y0) / (y1 - y0)}%`;
    }

    private fail(reason: string) {
        if (this.isDestroyed) return;
        this.destroy();
        this.onFailure(reason);
    }

    private stopCamera() {
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.video?.remove();
        this.video = null;
    }
}

function createVideo(stream: MediaStream): HTMLVideoElement {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    // Behind the transparent game canvas, mirrored like a mirror. Geometry: placeVideo().
    Object.assign(video.style, {
        position: "absolute",
        zIndex: "0",
        objectFit: "fill",
        transform: "scaleX(-1)",
        filter: "saturate(0.7) contrast(1.05)",
        pointerEvents: "none",
    });
    return video;
}

function toAim(point: GamePoint | null): AimPoint | null {
    return point ? { x: point[0], y: point[1] } : null;
}
