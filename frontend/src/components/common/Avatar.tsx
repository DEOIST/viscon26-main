import styles from "./Avatar.module.css";

interface AvatarArgs {
    avatar: string; // "a1"…"a8"
    name: string;
    isLarge?: boolean;
}

// Placeholder portrait (a colored disc with the initial) until the generated avatars land.
export default function Avatar(args: AvatarArgs) {
    const classNames = [
        styles.avatar,
        styles[args.avatar] ?? styles.a1,
        args.isLarge ? styles.large : "",
    ].join(" ");

    return (
        <span className={classNames} aria-hidden="true">
            {args.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
    );
}
