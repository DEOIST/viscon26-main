// Hold to grab, drag and release to throw: the fallback when the camera or the engine
// isn't, and the operator's override (M). Listens on the game container, which the canvas fills.

import type { Tracking } from "./cvStream";
import type { AimPoint, InputSource } from "./InputSource";

export default class MouseInput implements InputSource {
    readonly mode = "mouse";
    readonly landmarks = null;
    readonly tracking: Tracking = "ok";
    aim: AimPoint | null = null;
    pinching = false;
    private readonly previousCursor: string;
    private shots: AimPoint[] = [];
    private readonly element: HTMLElement;

    constructor(element: HTMLElement) {
        this.element = element;
        this.previousCursor = element.style.cursor;
        element.style.cursor = "none";
        element.addEventListener("pointermove", this.handleMove);
        element.addEventListener("pointerdown", this.handleDown);
        window.addEventListener("pointerup", this.handleUp);
        window.addEventListener("pointercancel", this.handleCancel);
        window.addEventListener("blur", this.handleCancel);
    }

    takeShots(): AimPoint[] {
        const shots = this.shots;
        this.shots = [];
        return shots;
    }

    destroy() {
        this.element.removeEventListener("pointermove", this.handleMove);
        this.element.removeEventListener("pointerdown", this.handleDown);
        window.removeEventListener("pointerup", this.handleUp);
        window.removeEventListener("pointercancel", this.handleCancel);
        window.removeEventListener("blur", this.handleCancel);
        this.element.style.cursor = this.previousCursor;
    }

    private readonly handleMove = (event: PointerEvent) => {
        this.aim = this.toGameArea(event);
    };

    private readonly handleDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const point = this.toGameArea(event);
        this.pinching = true;
        this.aim = point;
        this.shots.push(point);
    };

    private readonly handleUp = (event: PointerEvent) => {
        if (event.button !== 0) return;
        this.aim = this.toGameArea(event);
        this.pinching = false;
    };

    private readonly handleCancel = () => {
        this.pinching = false;
    };

    private toGameArea(event: PointerEvent): AimPoint {
        // Phaser letterboxes/resizes the canvas in fullscreen; use its actual visible bounds.
        const canvas = this.element.querySelector("canvas");
        const rect = (canvas ?? this.element).getBoundingClientRect();
        return {
            x: Math.min(
                1,
                Math.max(0, (event.clientX - rect.left) / rect.width),
            ),
            y: Math.min(
                1,
                Math.max(0, (event.clientY - rect.top) / rect.height),
            ),
        };
    }
}
