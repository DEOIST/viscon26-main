import { useEffect, useRef, useState } from "react";
import { api, errorMessage, type AvatarSuggestion } from "../api";
import { COLORS } from "../config";
import {
    nearestByLightness,
    sampleSkin,
    SKIN_LIGHTNESS_OFFSET,
} from "../photo-avatar";
import type { Character } from "../types";
import { fill, TEXT } from "../misc/text";

const T = TEXT.photoAvatar;

type Detected = Pick<AvatarSuggestion, "glasses" | "gender"> & {
    aiUnavailable: boolean;
};

/**
 * "Use a photo": one webcam still pre-fills the appearance swatches. Skin is measured on this
 * device; a small copy of the photo goes to the server (and OpenAI) for hair and eye color.
 * Everything stays editable with the swatches below.
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
                    e?.name === "NotAllowedError" ? T.cameraDenied : T.noCamera,
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
                skinColor: skin.value,
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
            setError(fill(T.failedSkinOnly, { error: errorMessage(e) }));
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
                    {T.open}
                </button>
            ) : (
                <div className="photo-capture">
                    <div className="photo-frame">
                        <video ref={videoRef} autoPlay playsInline muted />
                        <div className="photo-oval" aria-hidden="true" />
                    </div>
                    <small>{T.instructions}</small>
                    <div className="form-actions">
                        <button
                            type="button"
                            className="button ghost"
                            disabled={busy}
                            onClick={() => setOpen(false)}
                        >
                            {TEXT.common.cancel}
                        </button>
                        <button
                            type="button"
                            className="button primary"
                            disabled={busy || disabled}
                            onClick={capture}
                        >
                            {busy ? T.reading : T.takePhoto}
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
                        ? T.aiUnavailable
                        : fill(T.result, {
                              glasses: detected.glasses
                                  ? TEXT.characterBuilder.glasses.options[
                                        detected.glasses
                                    ]
                                  : T.noGlasses,
                              gender:
                                  detected.gender === "unclear" ||
                                  !detected.gender
                                      ? T.genderUnclear
                                      : TEXT.characterBuilder.gender.options[
                                            detected.gender
                                        ],
                          })}
                </p>
            )}
        </div>
    );
}
