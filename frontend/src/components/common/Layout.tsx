import { useEffect, type ReactNode } from "react";
import { APP_NAME } from "../../misc/constants";
import styles from "./Layout.module.css";

interface LayoutArgs {
    title: string;
    children: ReactNode;
}

// Navigation is plain <a href> — every page is a separate HTML document (see CLAUDE.md).
const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
];

export default function Layout(args: LayoutArgs) {
    useEffect(() => {
        document.title = `${args.title} · ${APP_NAME}`;
    }, [args.title]);

    const currentPath = window.location.pathname;

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <a href="/" className={styles.brand}>
                    {APP_NAME}
                </a>
                <nav className={styles.nav}>
                    {NAV_LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={
                                link.href === currentPath
                                    ? styles.activeLink
                                    : styles.link
                            }
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>
            </header>
            <main className={styles.main}>{args.children}</main>
        </div>
    );
}
