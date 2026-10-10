// The one input the shooter scene talks to. Starts with the finger-detection engine and
// switches to the mouse when the camera or the engine fails, or when the operator presses M.
// C recalibrates the aim (hold the finger gun still at the centre); R starts and stops a
// recording of the camera stream (development servers only).

import MouseInput from "./MouseInput";
import ServerHandInput from "./ServerHandInput";
import { fill, TEXT } from "../../src/misc/text";
import type { Tracking } from "./cvStream";
import type { AimPoint, InputSource } from "./InputSource";

export default class SwitchableInput implements InputSource {
    notice: string | null = null; // why we're in mouse mode, for the HUD
    private current: InputSource;
    private readonly parent: HTMLElement;

    constructor(parent: HTMLElement, cooldownMs: number | null) {
        this.parent = parent;
        const camera = new ServerHandInput(parent, cooldownMs, (reason) =>
            this.useMouse(fill(TEXT.shooter.camera.mouseMode, { reason })),
        );
        this.current = camera;
        window.addEventListener("keydown", this.handleKey);
        camera.start();
    }

    get mode() {
        return this.current.mode;
    }
    get aim(): AimPoint | null {
        return this.current.aim;
    }
    get tracking(): Tracking {
        return this.current.tracking;
    }
    get landmarks(): AimPoint[] | null {
        return this.current.landmarks;
    }
    get latencyMs(): number | null {
        return this.current instanceof ServerHandInput
            ? this.current.latencyMs
            : null;
    }

    get recording(): boolean {
        return (
            this.current instanceof ServerHandInput && this.current.recording
        );
    }

    takeShots(): AimPoint[] {
        return this.current.takeShots();
    }

    destroy() {
        window.removeEventListener("keydown", this.handleKey);
        this.current.destroy();
    }

    private useMouse(notice: string) {
        if (this.current.mode === "mouse") return;
        this.current.destroy();
        this.current = new MouseInput(this.parent);
        this.notice = notice;
    }

    private readonly handleKey = (event: KeyboardEvent) => {
        if (event.key === "m" || event.key === "M")
            this.useMouse(TEXT.shooter.camera.operatorMouse);
        if (!(this.current instanceof ServerHandInput)) return;
        if (event.key === "r" || event.key === "R")
            this.current.toggleRecording();
        if (event.key === "c" || event.key === "C") this.current.recenter();
    };
}
