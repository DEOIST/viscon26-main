import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GAMES, TOTAL_ECTS, YEARS } from "../config";
import { isYearComplete, isYearUnlocked } from "../store";
import type { Game, Player, Progress } from "../types";
import { Avatar } from "./Avatar";
import { GameHost } from "./GameHost";
import { Icon } from "./Icon";
import {
    PresentationTimeline,
    reducedMotion,
    useAnimatedNumber,
} from "../misc/motion";
import styles from "./GameWorkspace.module.css";

export interface CompletionFeedback {
    id: number;
    delta: number;
    unlockedYears: number[];
}

const ENTRIES = YEARS.flatMap((year, yearIndex) =>
    year.games.map((game) => ({ game, year, yearIndex })),
);

interface GameWorkspaceArgs {
    player: Player;
    progress: Progress;
    ects: number;
    eligible: boolean;
    graduationPreview?: boolean;
    busy: boolean;
    error: string;
    selectedGame: Game | null;
    completionFeedback?: CompletionFeedback | null;
    onOpen(game: Game): void;
    onComplete(score?: number): void; // no score: retry saving
    onExit(): void;
    onGraduate(): void;
    onScoreboard(): void;
    onEditCharacter(): void;
}

export default function GameWorkspace(args: GameWorkspaceArgs) {
    const [activeIndex, setActiveIndex] = useState(() => {
        const next = ENTRIES.findIndex(
            ({ game, yearIndex }) =>
                isYearUnlocked(yearIndex, args.progress.completedGameIds) &&
                !args.progress.completedGameIds.includes(game.id),
        );
        return Math.max(0, next);
    });
    const panel = useRef<HTMLDivElement>(null);
    const direction = useRef(1);
    const previousIndex = useRef(activeIndex);
    const initialFeedback = useRef(args.completionFeedback?.id);
    const seenFeedback = useRef(args.completionFeedback?.id);
    const drawerMotion = useRef<PresentationTimeline | null>(null);
    const [feedback, setFeedback] = useState<CompletionFeedback | null>(null);
    const displayedEcts = useAnimatedNumber(
        args.ects,
        args.completionFeedback?.id !== initialFeedback.current
            ? args.completionFeedback?.id
            : undefined,
    );
    useEffect(() => {
        const confirmed = args.completionFeedback;
        if (!confirmed || confirmed.id === seenFeedback.current) return;
        seenFeedback.current = confirmed.id;
        if (confirmed.delta <= 0) return;
        setFeedback(confirmed);
        const run = new PresentationTimeline();
        void run.wait(1500).then(() => {
            if (run.active) setFeedback(null);
        });
        return () => run.dispose();
    }, [args.completionFeedback]);
    useEffect(() => {
        if (previousIndex.current === activeIndex) return;
        previousIndex.current = activeIndex;
        if (args.selectedGame || reducedMotion()) return;
        const animation = panel.current?.animate?.(
            [
                {
                    opacity: 0.25,
                    transform: `translateX(${direction.current * 24}px)`,
                },
                { opacity: 1, transform: "translateX(0)" },
            ],
            { duration: 340, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
        return () => animation?.cancel();
    }, [activeIndex, args.selectedGame]);
    useEffect(() => () => drawerMotion.current?.dispose(), []);
    const studentMenu = useRef<HTMLDialogElement>(null);
    const menuTrigger = useRef<HTMLButtonElement>(null);
    const entry = args.selectedGame
        ? ENTRIES.find(({ game }) => game.id === args.selectedGame?.id)!
        : ENTRIES[activeIndex];
    const { game, year, yearIndex } = entry;
    const completed = args.progress.completedGameIds.includes(game.id);
    const unlocked = isYearUnlocked(yearIndex, args.progress.completedGameIds);
    const state = !unlocked ? "Locked" : completed ? "Completed" : "Available";

    function handleMove(delta: number) {
        if (args.selectedGame || args.busy) return;
        direction.current = Math.sign(delta);
        setActiveIndex(
            (current) => (current + delta + ENTRIES.length) % ENTRIES.length,
        );
    }

    function handleSelect(index: number) {
        direction.current = index >= activeIndex ? 1 : -1;
        setActiveIndex(index);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (
            args.selectedGame ||
            args.busy ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
        )
            return;
        const target = event.target as HTMLElement;
        if (target.closest("input, select, textarea, [contenteditable=true]"))
            return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            handleMove(event.key === "ArrowRight" ? 1 : -1);
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            handleSelect(event.key === "Home" ? 0 : ENTRIES.length - 1);
        }
    }

    async function handleCloseMenu(after?: () => void) {
        const dialog = studentMenu.current;
        if (dialog?.open) {
            if (drawerMotion.current?.active) return;
            const run = new PresentationTimeline();
            drawerMotion.current = run;
            dialog.classList.add("is-closing");
            await run.wait(160);
            if (!run.active) return;
            dialog.close();
            dialog.classList.remove("is-closing");
            run.dispose();
            menuTrigger.current?.focus();
        }
        after?.();
    }

    // The same compact record is used in the desktop sidebar and mobile drawer.
    const studentRecord = (
        <>
            <div className={styles.studentIdentity}>
                <button
                    type="button"
                    className={styles.portrait}
                    title="Edit character"
                    aria-label="Edit character"
                    disabled={args.busy || !!args.selectedGame}
                    onClick={() => void handleCloseMenu(args.onEditCharacter)}
                >
                    <Avatar character={args.player.character} />
                </button>
                <h1>{args.player.name}</h1>
                <span className={styles.department}>D-INFK</span>
                <small>Anonymous student</small>
            </div>
            <div className={styles.progress}>
                <div>
                    <span>Degree progress</span>
                    <strong>
                        {displayedEcts} / {TOTAL_ECTS}
                    </strong>
                </div>
                <progress
                    value={displayedEcts}
                    max={TOTAL_ECTS}
                    aria-label="Degree ECTS earned"
                />
                <small>
                    ECTS earned · {args.progress.completedGameIds.length} /{" "}
                    {GAMES.length} games
                </small>
            </div>
            <nav className={styles.studentActions} aria-label="Student actions">
                <button
                    className="button secondary compact"
                    onClick={() => {
                        void handleCloseMenu(args.onScoreboard);
                    }}
                >
                    <Icon name="trophy" size={17} /> Scoreboard
                </button>
            </nav>
            <p className={styles.recordNote}>
                Progress stays in this browser. Your chosen name appears on the
                leaderboard.
            </p>
            <div className={styles.sidebarBottom}>
                <span>ETH After Hours</span>
                <small>Unofficial student parody.</small>
            </div>
        </>
    );

    return (
        <div className={styles.workspace}>
            <aside className={styles.sidebar} aria-label="Student record">
                {studentRecord}
            </aside>
            <div className={styles.rail}>
                <button
                    ref={menuTrigger}
                    className="icon-button"
                    aria-label="Student menu"
                    aria-haspopup="dialog"
                    onClick={() => studentMenu.current?.showModal()}
                >
                    <Icon name="user" size={20} />
                </button>
                <span>
                    {displayedEcts}
                    <small>ECTS</small>
                </span>
            </div>
            <dialog
                ref={studentMenu}
                className={styles.drawer}
                aria-label="Student record"
                onCancel={(event) => {
                    event.preventDefault();
                    void handleCloseMenu();
                }}
                onClick={(event) => {
                    if (event.target === event.currentTarget) handleCloseMenu();
                }}
            >
                <button
                    className={`icon-button ${styles.closeDrawer}`}
                    aria-label="Close student menu"
                    onClick={() => void handleCloseMenu()}
                >
                    <Icon name="close" />
                </button>
                {studentRecord}
            </dialog>
            <section
                className={styles.gameArea}
                aria-label="Minigames"
                onKeyDown={handleKeyDown}
            >
                <nav className={styles.navigation} aria-label="Game navigation">
                    <div className={styles.years}>
                        {YEARS.map((item, index) => {
                            const isUnlocked = isYearUnlocked(
                                index,
                                args.progress.completedGameIds,
                            );
                            const isComplete = isYearComplete(
                                item,
                                args.progress.completedGameIds,
                            );
                            return (
                                <button
                                    key={item.id}
                                    className={`${year.id === item.id ? styles.activeYear : ""} ${feedback?.unlockedYears.includes(index) ? styles.justUnlocked : ""}`}
                                    aria-current={
                                        year.id === item.id ? "true" : undefined
                                    }
                                    disabled={!!args.selectedGame || args.busy}
                                    onClick={() =>
                                        handleSelect(
                                            ENTRIES.findIndex(
                                                (value) =>
                                                    value.year.id === item.id,
                                            ),
                                        )
                                    }
                                >
                                    <Icon
                                        name={
                                            isComplete
                                                ? "check"
                                                : isUnlocked
                                                  ? "cap"
                                                  : "lock"
                                        }
                                        size={13}
                                    />
                                    {item.title}
                                </button>
                            );
                        })}
                    </div>
                    <div className={styles.arrows}>
                        <button
                            className="icon-button"
                            aria-label="Previous game"
                            disabled={
                                !!args.selectedGame ||
                                args.busy ||
                                ENTRIES.length < 2
                            }
                            onClick={() => handleMove(-1)}
                        >
                            <Icon name="back" size={18} />
                        </button>
                        <span
                            aria-label={`Game ${activeIndex + 1} of ${ENTRIES.length}`}
                        >
                            {activeIndex + 1} / {ENTRIES.length}
                        </span>
                        <button
                            className="icon-button"
                            aria-label="Next game"
                            disabled={
                                !!args.selectedGame ||
                                args.busy ||
                                ENTRIES.length < 2
                            }
                            onClick={() => handleMove(1)}
                        >
                            <Icon name="arrow" size={18} />
                        </button>
                    </div>
                </nav>
                <div
                    className={styles.gameSelectors}
                    role="group"
                    aria-label={`${year.title} games`}
                >
                    {year.games.map((item) => (
                        <button
                            key={item.id}
                            className={
                                item.id === game.id ? styles.activeGame : ""
                            }
                            aria-pressed={item.id === game.id}
                            disabled={!!args.selectedGame || args.busy}
                            onClick={() =>
                                handleSelect(
                                    ENTRIES.findIndex(
                                        ({ game: value }) =>
                                            value.id === item.id,
                                    ),
                                )
                            }
                        >
                            {item.title}
                        </button>
                    ))}
                </div>
                <div
                    ref={panel}
                    className={styles.panel}
                    role="region"
                    aria-roledescription="carousel"
                    aria-label="Active game"
                    tabIndex={0}
                >
                    <header className={styles.gameHeading}>
                        <div>
                            <span>{year.title}</span>
                            <h2>{game.title}</h2>
                        </div>
                        <div className={styles.gameMeta}>
                            <span className={styles.reward}>
                                {game.ects} ECTS
                            </span>
                            <span
                                className={
                                    completed
                                        ? styles.completed
                                        : styles.gameState
                                }
                            >
                                <Icon
                                    name={
                                        !unlocked
                                            ? "lock"
                                            : completed
                                              ? "check"
                                              : "cap"
                                    }
                                    size={14}
                                />
                                {state}
                            </span>
                            {args.selectedGame && (
                                <button
                                    className="button ghost compact"
                                    disabled={args.busy}
                                    onClick={args.onExit}
                                >
                                    <Icon name="back" size={14} /> Overview
                                </button>
                            )}
                        </div>
                    </header>
                    <div className={styles.gameContent}>
                        {args.selectedGame ? (
                            <GameHost
                                compact
                                game={game}
                                player={args.player}
                                ects={args.ects}
                                completedGameIds={
                                    args.progress.completedGameIds
                                }
                                busy={args.busy}
                                error={args.error}
                                onComplete={args.onComplete}
                                onExit={args.onExit}
                            />
                        ) : (
                            <div className={styles.launchPanel}>
                                <span className={styles.launchIcon}>
                                    <Icon
                                        name={
                                            !unlocked
                                                ? "lock"
                                                : completed
                                                  ? "check"
                                                  : "slot"
                                        }
                                        size={38}
                                    />
                                </span>
                                <h3>
                                    {!unlocked
                                        ? `${year.title} is still locked.`
                                        : completed
                                          ? "Ready for another visit?"
                                          : game.title}
                                </h3>
                                <p>
                                    {!unlocked
                                        ? `Complete every minigame in Year ${year.id - 1} to unlock this game.`
                                        : year.description}
                                </p>
                                {!game.implemented && unlocked && (
                                    <small>
                                        Preview component · no ECTS awarded
                                    </small>
                                )}
                                <button
                                    className="button primary"
                                    disabled={!unlocked || args.busy}
                                    onClick={() => {
                                        if (
                                            isYearUnlocked(
                                                yearIndex,
                                                args.progress.completedGameIds,
                                            )
                                        )
                                            args.onOpen(game);
                                    }}
                                >
                                    {!unlocked
                                        ? "Locked"
                                        : game.implemented
                                          ? completed
                                              ? "Open game"
                                              : "Launch game"
                                          : "Open preview"}
                                    <Icon
                                        name={unlocked ? "arrow" : "lock"}
                                        size={17}
                                    />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <footer className={styles.degreeActions}>
                    {feedback && (
                        <span
                            key={feedback.id}
                            className={styles.ectsPopup}
                            role="status"
                        >
                            +{feedback.delta} ECTS
                        </span>
                    )}
                    <p aria-live="polite">
                        {args.error && !args.selectedGame
                            ? args.error
                            : args.eligible
                              ? "All years complete. Your diploma is ready."
                              : `${TOTAL_ECTS - args.ects} ECTS to graduation.`}
                    </p>
                    <button
                        className="button primary compact"
                        disabled={
                            (!args.eligible && !args.graduationPreview) ||
                            args.busy ||
                            !!args.selectedGame
                        }
                        onClick={args.onGraduate}
                    >
                        {args.busy
                            ? "Saving…"
                            : !args.eligible && args.graduationPreview
                              ? "Preview graduation"
                              : args.progress.graduated
                                ? "View graduation"
                                : "Graduate"}
                        <Icon
                            name={
                                args.eligible || args.graduationPreview
                                    ? "cap"
                                    : "lock"
                            }
                            size={16}
                        />
                    </button>
                </footer>
            </section>
        </div>
    );
}
