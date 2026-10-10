// Pointer aim and click to shoot: always available, the fallback when the camera or the engine
// isn't, and the operator's override (M). Listens on the game container, which the canvas fills.

import type { Tracking } from "../../../misc/CommonInt";
import type { AimPoint, InputSource } from "./InputSource";

export default class MouseInput implements InputSource {
    readonly mode = "mouse";
    readonly landmarks = null;
    readonly tracking: Tracking = "ok";
    aim: AimPoint | null = null;
    private shots: AimPoint[] = [];
    private readonly element: HTMLElement;

    constructor(element: HTMLElement) {
        this.element = element;
        element.addEventListener("pointermove", this.handleMove);
        element.addEventListener("pointerdown", this.handleDown);
    }

    takeShots(): AimPoint[] {
        const shots = this.shots;
        this.shots = [];
        return shots;
    }

    destroy() {
        this.element.removeEventListener("pointermove", this.handleMove);
        this.element.removeEventListener("pointerdown", this.handleDown);
    }

    private readonly handleMove = (event: PointerEvent) => {
        this.aim = this.toGameArea(event);
    };

    private readonly handleDown = (event: PointerEvent) => {
        const point = this.toGameArea(event);
        this.aim = point;
        this.shots.push(point);
    };

    private toGameArea(event: PointerEvent): AimPoint {
        const rect = this.element.getBoundingClientRect();
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
