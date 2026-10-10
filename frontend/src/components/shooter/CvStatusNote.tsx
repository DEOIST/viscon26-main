import { apiGetCvStatus } from "../../misc/apiClient";
import { useApi } from "../../misc/useApi";
import styles from "./CvStatusNote.module.css";

// Tells the player, before the round, whether finger tracking is ready or the mouse takes over.
export default function CvStatusNote() {
    const status = useApi(apiGetCvStatus);

    if (!window.isSecureContext)
        return (
            <p className={styles.note}>
                The camera only works on https:// or localhost, so you'll play
                with the mouse here.
            </p>
        );
    if (status.loading && status.data === null)
        return <p className={styles.note}>Checking the finger tracker…</p>;
    if (status.data?.available)
        return (
            <p className={styles.ready}>
                Finger tracking is ready. Click Start, allow the camera, and
                keep your hand 40–80 cm from it. Press M to switch to the mouse.
                Camera frames are analysed on our server and never stored.
            </p>
        );
    return (
        <p className={styles.note}>
            Finger tracking is unavailable (
            {status.data?.reason ?? status.error ?? "unknown reason"}), so
            you'll play with the mouse.
        </p>
    );
}
