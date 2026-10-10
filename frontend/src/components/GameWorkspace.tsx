import { useRef, useState, type KeyboardEvent } from "react";
import { GAMES, TOTAL_ECTS, YEARS } from "../config";
import { isYearComplete, isYearUnlocked } from "../store";
import type { Game, Player, Progress } from "../types";
import { Avatar } from "./Avatar";
import { GameHost } from "./GameHost";
import { Icon } from "./Icon";
import styles from "./GameWorkspace.module.css";

const ENTRIES = YEARS.flatMap((year, yearIndex) =>
    year.games.map((game) => ({ game, year, yearIndex })),
);

interface GameWorkspaceArgs {
    player: Player;
    progress: Progress;
    ects: number;
    eligible: boolean;
    authenticated: boolean;
    busy: boolean;
    error: string;
    selectedGame: Game | null;
    onOpen(game: Game): void;
    onComplete(): void;
    onAttempt?(score: number): void;
    onExit(): void;
    onGraduate(): void;
    onAccount(): void;
    onScoreboard(): void;
    onHistory(): void;
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
        setActiveIndex(
            (current) => (current + delta + ENTRIES.length) % ENTRIES.length,
        );
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
            setActiveIndex(event.key === "Home" ? 0 : ENTRIES.length - 1);
        }
    }

    function handleCloseMenu() {
        studentMenu.current?.close();
        menuTrigger.current?.focus();
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
                    onClick={args.onEditCharacter}
                >
                    <Avatar character={args.player.character} />
                </button>
                <h1>{args.player.name}</h1>
                <span className={styles.department}>D-INFK</span>
                <small>
                    {args.authenticated ? "Account saved" : "Guest student"}
                </small>
            </div>
            <div className={styles.progress}>
                <div>
                    <span>Degree progress</span>
                    <strong>
                        {args.ects} / {TOTAL_ECTS}
                    </strong>
                </div>
                <progress
                    value={args.ects}
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
                        handleCloseMenu();
                        args.onScoreboard();
                    }}
                >
                    <Icon name="trophy" size={17} /> Scoreboard
                </button>
                <button
                    className="button secondary compact"
                    onClick={() => {
                        handleCloseMenu();
                        args.onHistory();
                    }}
                >
                    <Icon name="calendar" size={17} /> History
                </button>
                <button
                    className="button ghost compact"
                    disabled={args.busy}
                    onClick={() => {
                        handleCloseMenu();
                        args.onAccount();
                    }}
                >
                    <Icon name="user" size={17} />{" "}
                    {args.authenticated ? "Account" : "Log in / Register"}
                </button>
            </nav>
            <p className={styles.recordNote}>
                {args.authenticated
                    ? "Your student record is saved to your account."
                    : "Guest progress is saved in this browser. An account keeps your degree across devices."}
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
                    {args.ects}
                    <small>ECTS</small>
                </span>
            </div>
            <dialog
                ref={studentMenu}
                className={styles.drawer}
                aria-label="Student record"
                onClick={(event) => {
                    if (event.target === event.currentTarget) handleCloseMenu();
                }}
            >
                <button
                    className={`icon-button ${styles.closeDrawer}`}
                    aria-label="Close student menu"
                    onClick={handleCloseMenu}
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
                                    className={
                                        year.id === item.id
                                            ? styles.activeYear
                                            : ""
                                    }
                                    aria-current={
                                        year.id === item.id ? "true" : undefined
                                    }
                                    disabled={!!args.selectedGame || args.busy}
                                    onClick={() =>
                                        setActiveIndex(
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
                                setActiveIndex(
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
                                onAttempt={args.onAttempt}
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
                            !args.eligible || args.busy || !!args.selectedGame
                        }
                        onClick={args.onGraduate}
                    >
                        {args.busy
                            ? "Saving…"
                            : args.progress.graduated
                              ? "View graduation"
                              : "Graduate"}
                        <Icon name={args.eligible ? "cap" : "lock"} size={16} />
                    </button>
                </footer>
            </section>
        </div>
    );
}
