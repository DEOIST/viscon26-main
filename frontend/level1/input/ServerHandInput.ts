// The finger-detection engine's client (issue #13): webcam → JPEG frames → /api/cv/stream →
// aim, tracking, hand landmarks and shots. FramePacer decides when the next frame goes out (one
// in flight, never the same camera frame twice). The camera image itself is never shown, and
// frames are never stored, except in a recording a developer starts with R (development only).

import FramePacer from "./FramePacer";
import { FALLBACK_FRAME_MS, FRAME_WIDTH, JPEG_QUALITY } from "../config";
import { GAME_HEIGHT, GAME_WIDTH } from "../gameSize";
import { boxForAspect, isSameBox } from "./box";
import { cameraErrorMessage, closeMessage, cvStreamUrl } from "./cvStream";
import type {
    CvSlide,
    CvBoxMessage,
    CvRecenterMessage,
    CvRecordMessage,
    CvSettingsMessage,
    CvTriggerMessage,
    CvTriggerReply,
    GamePoint,
    Tracking,
} from "./cvStream";
import type { Box } from "./box";
import type { CvMessage } from "./cvStream";
import type { AimPoint, InputSource } from "./InputSource";

export default class ServerHandInput implements InputSource {
    readonly mode = "camera";
    aim: AimPoint | null = null;
    pinching = false;
    tracking: Tracking = "lost";
    landmarks: AimPoint[] | null = null;
    latencyMs: number | null = null; // round trip of the last frame, for the debug overlay
    recording = false; // the engine confirmed it saves this stream's frames
    private shots: AimPoint[] = [];
    private triggerReplies: CvTriggerReply[] = [];
    private slides: CvSlide[] = [];
    private slaps: ("left" | "right")[] = [];
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
    }

    // Separate from the constructor: a failure can be reported synchronously (no camera API on
    // an insecure origin), and the owner must already hold this input when it is.
    start() {
        void this.run();
    }

    // Development servers save every frame with what the engine measured (backend/captures/),
    // to find out why a shot fired or the aim shook. Production servers refuse.
    toggleRecording() {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        this.sendControl({ type: "record", on: !this.recording });
    }

    // The engine learns the aim's neutral position again the next time the gun is held still.
    recenter() {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        this.sendControl({ type: "recenter" });
    }

    // Trigger calibration: the scene paces the steps, the engine measures the fingertip gap.
    calibrateTrigger(step: CvTriggerMessage["step"]) {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        this.sendControl({ type: "trigger", step });
    }

    takeTriggerReplies(): CvTriggerReply[] {
        const replies = this.triggerReplies;
        this.triggerReplies = [];
        return replies;
    }

    takeSlides(): CvSlide[] {
        const slides = this.slides;
        this.slides = [];
        return slides;
    }

    takeSlaps(): ("left" | "right")[] {
        const slaps = this.slaps;
        this.slaps = [];
        return slaps;
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

    private async run() {
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
            // Unplugged, or the permission revoked: stopping it ourselves doesn't fire "ended".
            for (const track of this.stream.getVideoTracks())
                track.addEventListener("ended", () =>
                    this.fail("the camera was disconnected"),
                );
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
            this.pinching = message.pinching ?? false;
            this.aim = toAim(message.aim);
            this.landmarks =
                message.landmarks?.map((point) => toAim(point)!) ?? null;
            if (message.firedAt) this.shots.push(toAim(message.firedAt)!);
            if (message.slap) this.slaps.push(message.slap);
            if (message.slide) this.slides.push(message.slide);
            this.pacer.done();
        } else if (message.type === "record") {
            if (message.dir) console.info(`Recording frames to ${message.dir}`);
            else if (!this.recording)
                console.warn("Recording needs a server in development mode");
            this.recording = message.on;
        } else if (message.type === "trigger") {
            this.triggerReplies.push(message);
        } else if (message.type === "error") {
            this.pacer.done();
        }
    }

    // The engine's default box doesn't know the camera's shape: ask once for a box with the game
    // area's shape (box.ts), so the hand skeleton isn't stretched, and start streaming when the
    // engine confirms it with another ready.
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
            this.sendControl({ type: "box", box: fitted });
            return;
        }
        if (this.cooldownMs !== null)
            this.sendControl({ type: "settings", cooldownMs: this.cooldownMs });
        this.pacer.ready();
    }

    private sendControl(
        message:
            | CvBoxMessage
            | CvSettingsMessage
            | CvRecordMessage
            | CvRecenterMessage
            | CvTriggerMessage,
    ) {
        this.socket?.send(JSON.stringify(message));
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
    // Only a frame source: the game draws its own backdrop instead of the camera image. It stays
    // in the page, 1 px and transparent, because browsers may stop decoding a detached or
    // display:none video, and then requestVideoFrameCallback never fires.
    Object.assign(video.style, {
        position: "absolute",
        width: "1px",
        height: "1px",
        opacity: "0",
        pointerEvents: "none",
    });
    return video;
}

function toAim(point: GamePoint | null): AimPoint | null {
    return point ? { x: point[0], y: point[1] } : null;
}
