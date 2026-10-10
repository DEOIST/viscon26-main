// When to send the next camera frame to the finger-detection engine. Exactly one frame is in
// flight, so a slow network lowers the frame rate instead of building up lag; the same camera
// frame is never sent twice; and when a newer frame is already waiting as the answer arrives,
// it goes out at once instead of idling until the camera's next frame.

export default class FramePacer {
    private isReady = false;
    private isInFlight = false;
    private hasFreshFrame = false;
    private readonly send: () => void;

    // `send` must eventually be followed by done(): answer, error, or a frame it couldn't send.
    constructor(send: () => void) {
        this.send = send;
    }

    ready() {
        this.isReady = true;
        this.trySend();
    }

    cameraFrame() {
        this.hasFreshFrame = true;
        this.trySend();
    }

    done() {
        this.isInFlight = false;
        this.trySend();
    }

    private trySend() {
        if (!this.isReady || this.isInFlight || !this.hasFreshFrame) return;
        this.isInFlight = true;
        this.hasFreshFrame = false;
        this.send();
    }
}
