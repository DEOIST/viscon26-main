import { useEffect, useRef, useState } from "react";
import { api, errorMessage, type AvatarSuggestion } from "../api";
import { COLORS } from "../config";
import {
    nearestByLightness,
    sampleSkin,
    SKIN_LIGHTNESS_OFFSET,
} from "../photo-avatar";
import type { Character } from "../types";

type Detected = Pick<AvatarSuggestion, "glasses" | "gender"> & {
    aiUnavailable: boolean;
};

/**
 * "Use a photo": one webcam still pre-fills the appearance swatches. A small copy goes to the
 * server, which measures skin tone on the face it finds and asks OpenAI for the rest; the oval
 * guide's own measurement is only the fallback. Everything stays editable below.
 */
export function PhotoAvatar({
    disabled,
    onApply,
}: {
    disabled: boolean;
    onApply: (colors: Partial<Character>) => void;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [detected, setDetected] = useState<Detected | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!open) return;
        let stream: MediaStream | null = null;
        let cancelled = false;
        navigator.mediaDevices
            ?.getUserMedia({
                video: { width: 640, height: 480, facingMode: "user" },
                audio: false,
            })
            .then((s) => {
                if (cancelled) return s.getTracks().forEach((t) => t.stop());
                stream = s;
                if (videoRef.current) videoRef.current.srcObject = s;
            })
            .catch((e: DOMException) =>
                setError(
                    e?.name === "NotAllowedError"
                        ? "Camera access was denied. Pick your colors below instead."
                        : "No camera available. Pick your colors below instead.",
                ),
            );
        return () => {
            cancelled = true;
            stream?.getTracks().forEach((t) => t.stop());
        };
    }, [open]);

    async function capture() {
        const video = videoRef.current;
        if (!video?.videoWidth) return;
        const full = document.createElement("canvas");
        full.width = video.videoWidth;
        full.height = video.videoHeight;
        const ctx = full.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0);
        const skin = nearestByLightness(
            sampleSkin(
                ctx.getImageData(0, 0, full.width, full.height).data,
                full.width,
                full.height,
            ),
            COLORS.skin,
            SKIN_LIGHTNESS_OFFSET,
        );
        // 512 px wide is all the model reads at low detail
        const small = document.createElement("canvas");
        small.width = 512;
        small.height = Math.round((512 * full.height) / full.width);
        small
            .getContext("2d")!
            .drawImage(full, 0, 0, small.width, small.height);

        setBusy(true);
        setError("");
        try {
            const suggestion = await api.avatarSuggestion(
                small.toDataURL("image/jpeg", 0.85),
            );
            onApply({
                // The server measures on the face it finds; the oval guess is the fallback
                skinColor: suggestion.skinColor ?? skin.value,
                ...(suggestion.hairColor && {
                    hairColor: suggestion.hairColor,
                }),
                ...(suggestion.eyeColor && { eyeColor: suggestion.eyeColor }),
                ...(suggestion.glasses && { glasses: suggestion.glasses }),
                ...(suggestion.hairLength && {
                    hairLength: suggestion.hairLength,
                }),
                ...((suggestion.gender === "female" ||
                    suggestion.gender === "male") && {
                    gender: suggestion.gender,
                }),
            });
            setDetected({
                glasses: suggestion.glasses,
                gender: suggestion.gender,
                aiUnavailable: suggestion.source === "fallback",
            });
            setOpen(false);
        } catch (e) {
            // Skin was measured locally, so still apply it
            onApply({ skinColor: skin.value });
            setError(
                `${errorMessage(e)} Skin tone was set; pick hair and eyes below.`,
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="photo-avatar">
            {!open ? (
                <button
                    type="button"
                    className="button secondary"
                    disabled={disabled}
                    onClick={() => {
                        setOpen(true);
                        setError("");
                    }}
                >
                    Use a photo to pick my colors
                </button>
            ) : (
                <div className="photo-capture">
                    <div className="photo-frame">
                        <video ref={videoRef} autoPlay playsInline muted />
                        <div className="photo-oval" aria-hidden="true" />
                    </div>
                    <small>
                        Fit your face in the oval, facing a light. A small copy
                        of the photo goes to our server, which measures your
                        skin tone, and to OpenAI to read hair, eyes and glasses.
                        Nothing is stored.
                    </small>
                    <div className="form-actions">
                        <button
                            type="button"
                            className="button ghost"
                            disabled={busy}
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="button primary"
                            disabled={busy || disabled}
                            onClick={capture}
                        >
                            {busy ? "Reading your photo…" : "Take photo"}
                        </button>
                    </div>
                </div>
            )}
            {error && (
                <p role="alert" className="error-text">
                    {error}
                </p>
            )}
            {detected && !error && (
                <p className="photo-result" role="status">
                    {detected.aiUnavailable
                        ? "Skin tone set from your photo. The AI is unavailable right now, so pick hair and eyes below."
                        : `Colors set from your photo. Glasses: ${
                              detected.glasses ?? "none"
                          }. Gender guess: ${
                              detected.gender === "unclear" || !detected.gender
                                  ? "couldn't tell"
                                  : detected.gender
                          }. Adjust anything below.`}
                </p>
            )}
        </div>
    );
}
