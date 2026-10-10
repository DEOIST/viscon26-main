// This transient controller exists only in memory; saved acceptance screens never replay, and
// the presentation belongs to the first build only: edits keep the stage and skip it.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AdmissionPhase } from "../misc/admission";
import { PresentationTimeline, useReducedMotion } from "../misc/motion";
import type { Player } from "../types";
import { admissionLengths } from "./AdmissionLetter";
import { AcceptanceScreen, CharacterBuilder } from "./Screens";

interface AdmissionFlowArgs {
    player: Player;
    busy: boolean;
    error: string;
    onSave(next: Player, beforeApply?: () => Promise<void>): Promise<boolean>;
    onBack(draft: Player): void;
    onEdit(): void;
    onBegin(): void;
}

export default function AdmissionFlow(args: AdmissionFlowArgs) {
    const [phase, setPhase] = useState<AdmissionPhase>("idle");
    const [characters, setCharacters] = useState(0);
    const [editing, setEditing] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const timeline = useRef<PresentationTimeline | null>(null);
    const transfer = useRef<{ avatar: SVGSVGElement; rect: DOMRect } | null>(
        null,
    );
    const pending = useRef(false);
    const reduced = useReducedMotion();

    useEffect(() => () => timeline.current?.dispose(), []);
    useEffect(() => {
        if (reduced) {
            timeline.current?.skip();
            setPhase((current) =>
                current === "idle" || current === "initializing"
                    ? current
                    : "complete",
            );
        }
    }, [reduced]);

    function skip() {
        timeline.current?.skip();
        if (phase !== "initializing") setPhase("complete");
    }

    async function handleContinue(next: Player) {
        if (pending.current || args.busy) return;
        pending.current = true;
        const run = new PresentationTimeline();
        timeline.current?.dispose();
        timeline.current = run;
        setCharacters(0);
        setPhase("initializing");
        const source = root.current?.querySelector<SVGSVGElement>(
            ".portrait-frame .avatar",
        );
        source?.closest(".portrait-frame")?.scrollIntoView?.({
            block: "center",
            behavior: run.skipped ? "instant" : "smooth",
        });
        const initialized = run.wait(780);
        const saved = await args.onSave(next, async () => {
            await initialized;
            if (!run.active)
                throw new DOMException("Presentation cancelled", "AbortError");
            transfer.current = source
                ? {
                      avatar: source.cloneNode(true) as SVGSVGElement,
                      rect: source.getBoundingClientRect(),
                  }
                : null;
            setPhase(run.skipped ? "complete" : "travel");
        });
        if (run.active && !saved) {
            run.dispose();
            transfer.current = null;
            setPhase("idle");
        }
        pending.current = false;
    }

    useLayoutEffect(() => {
        if (args.player.onboardingStage !== "acceptance" || phase !== "travel")
            return;
        const run = timeline.current;
        const destination = root.current?.querySelector<SVGSVGElement>(
            "[data-admission-avatar] .avatar",
        );
        if (!run || !destination) return;
        let overlay: HTMLDivElement | null = null;
        let animation: Animation | undefined;
        let observer: ResizeObserver | undefined;
        let observerCleanup: (() => void) | undefined;
        const moving = transfer.current;
        window.scrollTo({ top: 0, behavior: "instant" });
        if (moving && !run.skipped) {
            overlay = document.createElement("div");
            overlay.className = "admission-avatar-transfer";
            overlay.setAttribute("aria-hidden", "true");
            Object.assign(overlay.style, {
                left: `${moving.rect.left}px`,
                top: `${moving.rect.top}px`,
                width: `${moving.rect.width}px`,
                height: `${moving.rect.height}px`,
            });
            moving.avatar.classList.remove("story-avatar");
            overlay.appendChild(moving.avatar);
            document.body.appendChild(overlay);
            const start = performance.now();
            const retarget = () => {
                if (!overlay) return;
                const current = overlay.getBoundingClientRect();
                const target = destination.getBoundingClientRect();
                animation?.cancel();
                const transform = (rect: DOMRect) =>
                    `translate(${rect.left - moving.rect.left}px, ${rect.top - moving.rect.top}px) scale(${rect.width / moving.rect.width}, ${rect.height / moving.rect.height})`;
                animation = overlay.animate?.(
                    [
                        { transform: transform(current) },
                        { transform: transform(target) },
                    ],
                    {
                        duration: Math.max(
                            1,
                            720 - (performance.now() - start),
                        ),
                        easing: "cubic-bezier(.16,.8,.2,1)",
                        fill: "forwards",
                    },
                );
            };
            retarget();
            if (typeof ResizeObserver !== "undefined") {
                observer = new ResizeObserver(retarget);
                observer.observe(destination);
            }
            window.addEventListener("resize", retarget);
            window.addEventListener("scroll", retarget, { passive: true });
            // Store one cleanup for all geometry changes; no per-frame layout measurements.
            observerCleanup = () => {
                window.removeEventListener("resize", retarget);
                window.removeEventListener("scroll", retarget);
            };
        }
        async function reveal() {
            await run!.wait(720);
            if (!run!.active) return;
            destination!.style.setProperty("visibility", "visible");
            animation?.cancel();
            overlay?.remove();
            if (run!.skipped) {
                setPhase("complete");
                return;
            }
            setPhase("emblem");
        }
        void reveal();
        return () => {
            animation?.cancel();
            overlay?.remove();
            observer?.disconnect();
            observerCleanup?.();
            destination.style.removeProperty("visibility");
        };
    }, [args.player.onboardingStage, phase]);

    useEffect(() => {
        const run = timeline.current;
        if (!run || phase !== "emblem") return;
        async function reveal() {
            const advance = async (next: AdmissionPhase, duration: number) => {
                await run!.wait(duration);
                if (!run!.active || run!.skipped) return false;
                setPhase(next);
                return true;
            };
            if (!(await advance("pause", 350))) return;
            if (!(await advance("stamp", 150))) return;
            if (!(await advance("text", 450))) return;
            const lengths = admissionLengths(args.player);
            const pause = 110;
            const total = lengths.reduce((sum, length) => sum + length, 0);
            const rate = (3300 - pause * (lengths.length - 1)) / total;
            await run!.frames(3300, (fraction) => {
                let elapsed = fraction * 3300;
                let visible = 0;
                for (const length of lengths) {
                    visible += Math.min(
                        length,
                        Math.max(0, Math.floor(elapsed / rate)),
                    );
                    elapsed -= length * rate + pause;
                }
                setCharacters(visible);
            });
            if (!run!.active || run!.skipped) return;
            setPhase("edit");
            if (!(await advance("begin", 250))) return;
            await advance("complete", 350);
        }
        void reveal();
        // Phase changes belong to this single run; rerenders do not start another sequence.
    }, [phase === "emblem"]);

    function handleEdit() {
        timeline.current?.dispose();
        transfer.current = null;
        setPhase("idle");
        setEditing(true);
        args.onEdit();
    }

    // The letter was already presented once, so an update saves straight back to it.
    async function handleUpdate(next: Player) {
        if (await args.onSave(next)) setEditing(false);
    }

    return (
        <div ref={root} data-admission-phase={phase}>
            {args.player.onboardingStage === "builder" || editing ? (
                <CharacterBuilder
                    player={args.player}
                    busy={args.busy || phase === "initializing"}
                    error={args.error}
                    initializing={phase === "initializing"}
                    onSkip={skip}
                    onBack={editing ? () => setEditing(false) : args.onBack}
                    onContinue={(next) =>
                        void (editing
                            ? handleUpdate(next)
                            : handleContinue(next))
                    }
                />
            ) : (
                <AcceptanceScreen
                    player={args.player}
                    busy={args.busy}
                    error={args.error}
                    onBack={handleEdit}
                    onBegin={args.onBegin}
                    phase={phase}
                    characters={characters}
                    onSkip={skip}
                />
            )}
        </div>
    );
}
