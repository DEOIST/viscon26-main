// The career photo on a diploma: tilted print, grade stamp, the graduate's avatar, a caption.
// Both diplomas use it; each passes its own avatar component.

import type { ReactNode } from "react";
import { ENDING_ART } from "../../misc/endingArt";
import type { EndingId } from "../../misc/CommonInt";
import styles from "./EndingPhoto.module.css";

interface EndingPhotoArgs {
    ending: EndingId;
    avatar: ReactNode;
}

export default function EndingPhoto(args: EndingPhotoArgs) {
    const art = ENDING_ART[args.ending];
    return (
        <figure className={styles.photo}>
            <div className={styles.frame}>
                <img
                    src={art.image}
                    alt={art.alt}
                    style={{ objectPosition: art.focus }}
                />
                <span className={styles.stamp}>{art.stamp}</span>
                <div className={styles.avatarBadge}>{args.avatar}</div>
            </div>
            <figcaption>{art.caption}</figcaption>
        </figure>
    );
}
