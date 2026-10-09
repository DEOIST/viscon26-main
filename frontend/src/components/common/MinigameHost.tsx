import { useEffect, useRef } from "react";
import type {
    MinigameResult,
    MountMinigame,
} from "../../games/shared/minigame";
import type { Character } from "../../misc/CommonInt";
import styles from "./MinigameHost.module.css";

interface MinigameHostArgs {
    mount: MountMinigame;
    character: Character;
    dialogue: Record<string, string[]> | null;
    onFinish: (result: MinigameResult) => void;
}

// The only caller of a mount function. Mounting in an effect and destroying in its cleanup also
// covers StrictMode's mount → destroy → mount in development. Keep `character` and `dialogue`
// stable while a round runs: a new object remounts the game.
export default function MinigameHost(args: MinigameHostArgs) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onFinishRef = useRef(args.onFinish);

    useEffect(() => {
        onFinishRef.current = args.onFinish;
    }, [args.onFinish]);

    useEffect(() => {
        const parent = containerRef.current;
        if (!parent) return;
        const handle = args.mount({
            parent,
            character: args.character,
            dialogue: args.dialogue,
            onFinish: (result) => onFinishRef.current(result),
        });
        return () => handle.destroy();
    }, [args.mount, args.character, args.dialogue]);

    return <div ref={containerRef} className={styles.host} />;
}
