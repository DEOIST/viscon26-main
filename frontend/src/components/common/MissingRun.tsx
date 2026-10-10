import styles from "./MissingRun.module.css";

interface MissingRunArgs {
    error?: string | null;
}

// Shown when a page needs `?run=` but has none, or the run can't be loaded.
export default function MissingRun(args: MissingRunArgs) {
    return (
        <div className={styles.box}>
            <p>{args.error ?? "No student found for this page."}</p>
            <a href="/enroll" className={styles.link}>
                Enroll a new student
            </a>
        </div>
    );
}
