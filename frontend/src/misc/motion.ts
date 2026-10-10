// Cancellable presentation work. Skipping completes visuals, never a pending save.
import { useEffect, useRef, useState } from "react";

export const reducedMotion = () =>
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useReducedMotion() {
    const [reduced, setReduced] = useState(reducedMotion);
    useEffect(() => {
        if (typeof matchMedia !== "function") return;
        const query = matchMedia("(prefers-reduced-motion: reduce)");
        const change = () => setReduced(query.matches);
        query.addEventListener("change", change);
        return () => query.removeEventListener("change", change);
    }, []);
    return reduced;
}

export class PresentationTimeline {
    active = true;
    skipped = reducedMotion();
    private pending = new Set<() => void>();

    skip() {
        this.skipped = true;
        for (const finish of [...this.pending]) finish();
    }

    dispose() {
        this.active = false;
        this.skip();
    }

    wait(duration: number): Promise<void> {
        if (!this.active || this.skipped) return Promise.resolve();
        return new Promise((resolve) => {
            const finish = () => {
                clearTimeout(timer);
                this.pending.delete(finish);
                resolve();
            };
            const timer = setTimeout(finish, duration);
            this.pending.add(finish);
        });
    }

    frames(
        duration: number,
        update: (fraction: number) => void,
    ): Promise<void> {
        if (!this.active || this.skipped) {
            if (this.active) update(1);
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let frame = 0;
            const start = performance.now();
            const finish = () => {
                cancelAnimationFrame(frame);
                this.pending.delete(finish);
                if (this.active) update(1);
                resolve();
            };
            const tick = (now: number) => {
                const fraction = Math.min(1, (now - start) / duration);
                update(fraction);
                if (fraction === 1) finish();
                else frame = requestAnimationFrame(tick);
            };
            this.pending.add(finish);
            frame = requestAnimationFrame(tick);
        });
    }
}

export function useAnimatedNumber(value: number, eventId?: number) {
    const [display, setDisplay] = useState(value);
    const current = useRef(value);
    useEffect(() => {
        const timeline = new PresentationTimeline();
        const from = current.current;
        const update = (next: number) => {
            current.current = next;
            setDisplay(next);
        };
        if (!eventId || timeline.skipped) update(value);
        else
            void timeline.frames(650, (t) =>
                update(Math.round(from + (value - from) * (1 - (1 - t) ** 3))),
            );
        return () => timeline.dispose();
    }, [value, eventId]);
    return display;
}
