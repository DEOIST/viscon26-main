// The source shell's theme and navigation, adapted to separate page documents.
import { useEffect, useState, type ReactNode } from "react";
import Icon from "./Icon";
import ScoreboardDialog from "./ScoreboardDialog";
import { shellClass } from "../../misc/shellStyles";

interface ShellLayoutArgs {
    title: string;
    children: ReactNode;
}
export default function ShellLayout(args: ShellLayoutArgs) {
    const [scoreboardOpen, setScoreboardOpen] = useState(false);
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        try {
            return localStorage.getItem("eth-simulator.theme") === "light"
                ? "light"
                : "dark";
        } catch {
            return "dark";
        }
    });
    useEffect(() => {
        document.title = `${args.title} · ETH Simulator`;
        try {
            localStorage.setItem("eth-simulator.theme", theme);
        } catch {
            /* Optional preference. */
        }
    }, [args.title, theme]);
    return (
        <div className={shellClass("shell app-shell")} data-theme={theme}>
            <a className={shellClass("skip-link")} href="#main-content">
                Skip to content
            </a>
            <header className={shellClass("topbar")}>
                <a href="/" className={shellClass("brand")}>
                    <span className={shellClass("brand-icon")}>
                        <Icon name="cap" size={25} />
                    </span>
                    <span>
                        ETH SIMULATOR<small>AFTER HOURS</small>
                    </span>
                </a>
                <nav
                    className={shellClass("top-actions")}
                    aria-label="Application actions"
                >
                    <button
                        className={shellClass("button ghost compact")}
                        aria-label="Hall of Fame"
                        onClick={() => setScoreboardOpen(true)}
                    >
                        <Icon name="trophy" size={17} />
                        <span className={shellClass("nav-label")}>
                            Hall of Fame
                        </span>
                    </button>
                    <a
                        href="/about"
                        className={shellClass("button ghost compact")}
                    >
                        About
                    </a>
                    <button
                        className={shellClass("icon-button theme-button")}
                        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                        onClick={() =>
                            setTheme(theme === "dark" ? "light" : "dark")
                        }
                    >
                        <Icon
                            name={theme === "dark" ? "sun" : "moon"}
                            size={19}
                        />
                    </button>
                </nav>
            </header>
            <main id="main-content" tabIndex={-1}>
                {args.children}
            </main>
            <footer className={shellClass("site-footer")}>
                <span>
                    <Icon name="cap" size={16} />
                    Unofficial student parody. No affiliation with or
                    endorsement by ETH Zürich.
                </span>
                <a href="/items">Starter items</a>
                <span>Made for the plot. And the credits.</span>
            </footer>
            {scoreboardOpen && (
                <ScoreboardDialog onClose={() => setScoreboardOpen(false)} />
            )}
        </div>
    );
}
