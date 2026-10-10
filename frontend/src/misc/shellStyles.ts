// Shared source-shell primitives, resolved through the scoped CSS Module.
import styles from "../components/common/ShellLayout.module.css";
export function shellClass(...names: string[]): string {
    return names
        .join(" ")
        .split(/\s+/)
        .filter(Boolean)
        .map(
            (name) =>
                styles[
                    name.replace(/-([a-z])/g, (_, letter: string) =>
                        letter.toUpperCase(),
                    )
                ] ?? "",
        )
        .join(" ");
}
