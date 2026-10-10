// The one input the shooter scene talks to. Starts with the finger-detection engine and
// switches to the mouse when the camera or the engine fails, or when the operator presses M.

import MouseInput from "./MouseInput";
import ServerHandInput from "./ServerHandInput";
import type { Tracking } from "../../../misc/CommonInt";
import type { AimPoint, InputSource } from "./InputSource";

export default class SwitchableInput implements InputSource {
    notice: string | null = null; // why we're in mouse mode, for the HUD
    private current: InputSource;
    private readonly parent: HTMLElement;

    constructor(parent: HTMLElement, cooldownMs: number | null) {
        this.parent = parent;
        this.current = new ServerHandInput(parent, cooldownMs, (reason) =>
            this.useMouse(`Mouse mode: ${reason}`),
        );
        window.addEventListener("keydown", this.handleKey);
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
            this.useMouse("Mouse mode (operator)");
    };
}
