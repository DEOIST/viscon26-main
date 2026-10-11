import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { GAMES, YEARS } from "../config";
import { isYearComplete, isYearUnlocked } from "../store";
import type { Game, Player, Progress } from "../types";
import { Avatar } from "./Avatar";
import HowToPlay, { hasHowToPlay } from "./HowToPlay";
import LectureResult from "./LectureResult";
import { GameHost } from "./GameHost";
import { Icon } from "./Icon";
import {
    PresentationTimeline,
    reducedMotion,
    useAnimatedNumber,
} from "../misc/motion";
import { creditSummary, gameEcts } from "../misc/credits";
import { fill, TEXT } from "../misc/text";
import CreditTranscript from "./common/CreditTranscript";
import year1Url from "../assets/years/year1.jpg";
import year2Url from "../assets/years/year2.jpg";
import year3Url from "../assets/years/year3.jpg";
import styles from "./GameWorkspace.module.css";

export interface CompletionFeedback {
    id: number;
    delta: number;
    unlockedYears: number[];
    gameId: string;
    gameTitle: string;
    score: number;
}

const T = TEXT.workspace;

const ENTRIES = YEARS.flatMap((year, yearIndex) =>
    year.games.map((game) => ({ game, year, yearIndex })),
);

// One blurred photo behind each year, in YEARS order: library, main building, thesis desk.
const BACKDROPS = [year1Url, year2Url, year3Url];

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
        // Everything done: open on the last year, where the diploma waits.
        return next === -1 ? ENTRIES.length - 1 : next;
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
    const state = !unlocked
        ? T.state.locked
        : completed
          ? T.state.completed
          : T.state.available;
    const earned = completed
        ? gameEcts(game, args.progress.scores[game.id])
        : null;
    // A played lecture shows its result; one still to play explains itself in three steps.
    const showsResult = earned !== null;
    const showsHowTo = unlocked && !showsResult && hasHowToPlay(game.id);
    // Older saves have no score: their completion paid in full.
    const score = args.progress.scores[game.id] ?? 100;
    // Years before the last lead on to the next one; only the last year graduates.
    const isLastYear = yearIndex === YEARS.length - 1;

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
                    data-student-portrait
                    title={TEXT.common.editCharacter}
                    aria-label={TEXT.common.editCharacter}
                    disabled={args.busy || !!args.selectedGame}
                    onClick={() => void handleCloseMenu(args.onEditCharacter)}
                >
                    <Avatar character={args.player.character} />
                </button>
                <h1>{args.player.name}</h1>
                <span className={styles.department}>D-INFK</span>
                <small>{T.anonymousStudent}</small>
            </div>
            <CreditTranscript
                compact
                summary={creditSummary(
                    args.progress.completedGameIds,
                    args.progress.scores,
                )}
                highlight={feedback?.gameId}
            />
            <nav
                className={styles.studentActions}
                aria-label={T.studentActions}
            >
                <button
                    className="button secondary compact"
                    onClick={() => {
                        void handleCloseMenu(args.onScoreboard);
                    }}
                >
                    <Icon name="trophy" size={17} /> {TEXT.app.scoreboard}
                </button>
            </nav>
            <p className={styles.recordNote}>{T.recordNote}</p>
            <div className={styles.sidebarBottom}>
                <span>{T.sidebarTitle}</span>
                <small>{T.sidebarTagline}</small>
            </div>
        </>
    );

    return (
        <div className={styles.workspace}>
            {/* In <body>: the workspace's fade-in would otherwise lift this fixed layer above the
                top bar. Every year stays mounted, so switching crossfades without a load, and its
                class parks earlier years left and later ones right, panning with the panel. */}
            {createPortal(
                <div className={styles.backdrop} aria-hidden="true">
                    {BACKDROPS.map((url, index) => (
                        <img
                            key={url}
                            src={url}
                            alt=""
                            decoding="async"
                            className={
                                index < yearIndex
                                    ? styles.pastYear
                                    : index === yearIndex
                                      ? styles.currentYear
                                      : undefined
                            }
                        />
                    ))}
                </div>,
                document.body,
            )}
            <aside className={styles.sidebar} aria-label={T.studentRecord}>
                {studentRecord}
            </aside>
            <div className={styles.rail}>
                <button
                    ref={menuTrigger}
                    className="icon-button"
                    data-student-rail
                    aria-label={T.studentMenu}
                    aria-haspopup="dialog"
                    onClick={() => studentMenu.current?.showModal()}
                >
                    <Icon name="user" size={20} />
                </button>
                <span>
                    {displayedEcts}
                    <small>{T.railEcts}</small>
                </span>
            </div>
            <dialog
                ref={studentMenu}
                className={styles.drawer}
                aria-label={T.studentRecord}
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
                    aria-label={T.closeStudentMenu}
                    onClick={() => void handleCloseMenu()}
                >
                    <Icon name="close" />
                </button>
                {studentRecord}
            </dialog>
            <section
                className={styles.gameArea}
                aria-label={T.minigames}
                onKeyDown={handleKeyDown}
            >
                <nav
                    className={styles.navigation}
                    aria-label={T.gameNavigation}
                >
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
                            aria-label={T.previousGame}
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
                            aria-label={fill(T.gamePosition, {
                                current: activeIndex + 1,
                                total: ENTRIES.length,
                            })}
                        >
                            {activeIndex + 1} / {ENTRIES.length}
                        </span>
                        <button
                            className="icon-button"
                            aria-label={T.nextGame}
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
                    ref={panel}
                    className={styles.panel}
                    role="region"
                    aria-roledescription="carousel"
                    aria-label={T.activeGame}
                    tabIndex={0}
                >
                    <header className={styles.gameHeading}>
                        <div>
                            <span>{year.title}</span>
                            <h2>{game.title}</h2>
                        </div>
                        <div className={styles.gameMeta}>
                            {earned === null ? (
                                <span className={styles.reward}>
                                    {fill(T.availableEcts, {
                                        ects: game.ects,
                                    })}
                                </span>
                            ) : (
                                <div
                                    key={game.id}
                                    className={styles.earned}
                                    role="meter"
                                    aria-label={T.earnedLabel}
                                    aria-valuemin={0}
                                    aria-valuemax={game.ects}
                                    aria-valuenow={earned}
                                    aria-valuetext={fill(T.earnedEcts, {
                                        earned,
                                        ects: game.ects,
                                    })}
                                >
                                    <span className={styles.earnedBar}>
                                        <span
                                            style={{
                                                width: `${(100 * earned) / game.ects}%`,
                                            }}
                                        />
                                    </span>
                                    <span className={styles.earnedText}>
                                        {fill(T.earnedEcts, {
                                            earned,
                                            ects: game.ects,
                                        })}
                                    </span>
                                </div>
                            )}
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
                                    <Icon name="back" size={14} />{" "}
                                    {TEXT.common.overview}
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
                                {showsResult ? (
                                    <LectureResult
                                        earned={earned}
                                        ects={game.ects}
                                        score={score}
                                    />
                                ) : showsHowTo ? (
                                    <HowToPlay gameId={game.id} />
                                ) : (
                                    <>
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
                                                ? fill(T.lockedTitle, {
                                                      year: year.title,
                                                  })
                                                : completed
                                                  ? T.revisitTitle
                                                  : game.title}
                                        </h3>
                                        <p>
                                            {!unlocked
                                                ? fill(T.lockedDescription, {
                                                      previousYear: year.id - 1,
                                                  })
                                                : year.description}
                                        </p>
                                    </>
                                )}
                                {!game.implemented && unlocked && (
                                    <small>{T.previewNote}</small>
                                )}
                                <button
                                    className={
                                        showsHowTo || showsResult
                                            ? `button primary ${styles.afterHowTo}`
                                            : "button primary"
                                    }
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
                                        ? T.launch.locked
                                        : game.implemented
                                          ? completed
                                              ? T.launch.open
                                              : T.launch.launch
                                          : T.launch.preview}
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
                            {fill(TEXT.credits.gained, {
                                ects: feedback.delta,
                                game: feedback.gameTitle,
                                score: feedback.score,
                            })}
                        </span>
                    )}
                    <p aria-live="polite">
                        {args.error && !args.selectedGame
                            ? args.error
                            : args.eligible
                              ? T.readyToGraduate
                              : fill(T.gamesRemaining, {
                                    games: GAMES.filter(
                                        (game) =>
                                            !args.progress.completedGameIds.includes(
                                                game.id,
                                            ),
                                    ).length,
                                })}
                    </p>
                    {isLastYear ? (
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
                                ? TEXT.common.saving
                                : !args.eligible && args.graduationPreview
                                  ? T.graduate.preview
                                  : args.progress.graduated
                                    ? T.graduate.view
                                    : T.graduate.graduate}
                            <Icon
                                name={
                                    args.eligible || args.graduationPreview
                                        ? "cap"
                                        : "lock"
                                }
                                size={16}
                            />
                        </button>
                    ) : (
                        <button
                            className="button primary compact"
                            disabled={
                                !completed || args.busy || !!args.selectedGame
                            }
                            onClick={() => handleMove(1)}
                        >
                            {T.next}
                            <Icon
                                name={completed ? "arrow" : "lock"}
                                size={16}
                            />
                        </button>
                    )}
                </footer>
            </section>
        </div>
    );
}
