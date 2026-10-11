import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";
import { GAMES, YEARS } from "./config";
import {
    CharacterBuilder,
    GraduationScreen,
    WelcomeScreen,
} from "./components/Screens";
import { ScoreboardDialog } from "./components/Dialogs";
import { Icon } from "./components/Icon";
import GameWorkspace, {
    type CompletionFeedback,
} from "./components/GameWorkspace";
import AdmissionFlow from "./components/AdmissionFlow";
import YearOneIntro from "./components/YearOneIntro";
import { fill, TEXT } from "./misc/text";
import {
    completeGame,
    calculateEcts,
    canGraduate,
    isYearUnlocked,
    markGraduated,
    replacePlayer,
    replaceProgress,
    selectCanGraduate,
    selectEcts,
    setStage,
    store,
    useAppDispatch,
    useAppSelector,
} from "./store";
import type { Game, Player } from "./types";

export function App() {
    const dispatch = useAppDispatch();
    const player = useAppSelector((state) => state.player);
    const progress = useAppSelector((state) => state.progress);
    const ects = useAppSelector(selectEcts);
    const eligible = useAppSelector(selectCanGraduate);
    const [scoreboard, setScoreboard] = useState(false);
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);
    const [graduation, setGraduation] = useState(progress.graduated);
    const [graduationPreview, setGraduationPreview] = useState(false);
    const [previewingGraduation, setPreviewingGraduation] = useState(false);
    // Editing during the degree keeps the saved stage, so it never replays the admission.
    const [editingCharacter, setEditingCharacter] = useState(false);
    const [busy, setBusy] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        try {
            return localStorage.getItem("eth-simulator.theme") === "light"
                ? "light"
                : "dark";
        } catch {
            return "dark";
        }
    });
    const [completionFeedback, setCompletionFeedback] =
        useState<CompletionFeedback | null>(null);
    const [celebrateGraduation, setCelebrateGraduation] = useState(false);
    // The first-day intro after "Begin Year 1", starting from the letter's avatar.
    const [intro, setIntro] = useState<{ from: SVGElement | null } | null>(
        null,
    );
    const completionId = useRef(0);
    const syncVersion = useRef(0);
    const mounted = useRef(true);
    const saving = useRef(false);
    const mainRef = useRef<HTMLElement>(null);

    async function synchronize() {
        const snapshot = store.getState();
        if (
            !snapshot.player.name ||
            !["acceptance", "main"].includes(snapshot.player.onboardingStage)
        )
            return;
        const version = ++syncVersion.current;
        setSyncing(true);
        setSyncError("");
        try {
            const remote = await api.synchronize(snapshot);
            if (!mounted.current) return;
            // A response may arrive after more local games were completed. Never erase them.
            const local = store.getState().progress;
            const ids = GAMES.filter(
                (game) =>
                    game.implemented &&
                    (local.completedGameIds.includes(game.id) ||
                        remote.completedGameIds.includes(game.id)),
            ).map((game) => game.id);
            // A score saved in this browser wins over the server's copy of the same game.
            const scores = Object.fromEntries(
                ids.flatMap((id) => {
                    const score = local.scores[id] ?? remote.scores[id];
                    return score === undefined ? [] : [[id, score]];
                }),
            );
            dispatch(
                replaceProgress({
                    completedGameIds: ids,
                    scores,
                    graduated:
                        (local.graduated || remote.graduated) &&
                        canGraduate(ids),
                    graduatedAt:
                        remote.graduatedAt || local.graduatedAt || null,
                }),
            );
        } catch (err) {
            if (mounted.current && version === syncVersion.current)
                setSyncError(errorMessage(err));
        } finally {
            if (mounted.current && version === syncVersion.current)
                setSyncing(false);
        }
    }
    useEffect(() => {
        mounted.current = true;
        void synchronize();
        api.config()
            .then((config) => {
                if (mounted.current)
                    setGraduationPreview(config.graduationPreview);
            })
            .catch(() => {
                /* Preview stays disabled when configuration is unavailable. */
            });
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document
            .querySelector('meta[name="theme-color"]')
            ?.setAttribute("content", theme === "dark" ? "#0C1220" : "#F4F7FC");
        try {
            localStorage.setItem("eth-simulator.theme", theme);
        } catch {
            /* Optional preference. */
        }
    }, [theme]);
    useEffect(() => {
        mainRef.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
    }, [
        player.onboardingStage,
        selectedGame?.id,
        graduation,
        previewingGraduation,
        editingCharacter,
    ]);

    async function savePlayer(
        next: Player,
        beforeApply?: () => Promise<void>,
    ): Promise<boolean> {
        if (saving.current) return false;
        saving.current = true;
        setBusy(true);
        setError("");
        try {
            await beforeApply?.();
            if (!mounted.current) return false;
            dispatch(replacePlayer(next));
            void synchronize();
            return true;
        } catch (err) {
            if (
                mounted.current &&
                !(err instanceof DOMException && err.name === "AbortError")
            )
                setError(errorMessage(err));
            return false;
        } finally {
            saving.current = false;
            if (mounted.current) setBusy(false);
        }
    }
    // `score` is undefined when the player retries saving an already recorded result.
    function finishGame(score?: number) {
        if (!selectedGame || saving.current) return;
        const previous = store.getState().progress;
        if (previous.completedGameIds.includes(selectedGame.id)) {
            setSelectedGame(null);
            return;
        }
        if (score === undefined) return;
        if (!GAMES.find((game) => game.id === selectedGame.id)?.implemented) {
            setError(TEXT.app.placeholderNoEcts);
            return;
        }
        dispatch(completeGame({ gameId: selectedGame.id, score }));
        const current = store.getState().progress;
        const ids = current.completedGameIds;
        if (!ids.includes(selectedGame.id)) return;
        setCompletionFeedback({
            id: ++completionId.current,
            delta:
                calculateEcts(ids, current.scores) -
                calculateEcts(previous.completedGameIds, previous.scores),
            gameId: selectedGame.id,
            gameTitle: selectedGame.title,
            score,
            unlockedYears: YEARS.flatMap((_, index) =>
                !isYearUnlocked(index, previous.completedGameIds) &&
                isYearUnlocked(index, ids)
                    ? [index]
                    : [],
            ),
        });
        setSelectedGame(null);
        // The last game decides the degree: go straight to the career it earned, no revisit
        // screen in between.
        if (canGraduate(ids) && !current.graduated) {
            graduate();
            return;
        }
        setNotice(TEXT.app.gameCompleted);
        void synchronize();
    }
    function graduate() {
        if (saving.current) return;
        const eligibleNow = canGraduate(
            store.getState().progress.completedGameIds,
        );
        if (!eligibleNow) {
            if (graduationPreview) setPreviewingGraduation(true);
            return;
        }
        const wasGraduated = store.getState().progress.graduated;
        dispatch(markGraduated());
        setCelebrateGraduation(!wasGraduated);
        setGraduation(true);
        if (!wasGraduated) void synchronize();
    }
    const inDegree = player.onboardingStage === "main";
    const showGraduation =
        graduation || (graduationPreview && previewingGraduation);
    const gameScreen = inDegree && !showGraduation && !editingCharacter;
    return (
        <div className={`app-shell ${gameScreen ? "game-screen" : ""}`}>
            <a className="skip-link" href="#main-content">
                {TEXT.app.skipToContent}
            </a>
            <header className="topbar">
                <div className="brand">
                    <span className="brand-icon">
                        <Icon name="cap" size={25} />
                    </span>
                    <span>{TEXT.app.brand}</span>
                </div>
                <nav className="top-actions" aria-label={TEXT.app.actionsLabel}>
                    {!inDegree && (
                        <button
                            className="button ghost compact"
                            aria-label={TEXT.app.scoreboard}
                            onClick={() => setScoreboard(true)}
                        >
                            <Icon name="trophy" size={17} />
                            <span className="nav-label">
                                {TEXT.app.scoreboard}
                            </span>
                        </button>
                    )}
                    <button
                        className="icon-button theme-button"
                        aria-label={
                            theme === "dark"
                                ? TEXT.app.switchToLight
                                : TEXT.app.switchToDark
                        }
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
            <main id="main-content" ref={mainRef} tabIndex={-1} inert={!!intro}>
                {notice && !showGraduation && (
                    <div className="notice" role="status">
                        <span>{notice}</span>
                        <button
                            className="icon-button"
                            onClick={() => setNotice("")}
                            aria-label={TEXT.app.dismissMessage}
                        >
                            <Icon name="close" size={16} />
                        </button>
                    </div>
                )}
                {syncError && !showGraduation && (
                    <div className="notice" role="status">
                        <span>
                            {fill(TEXT.app.syncFailed, { error: syncError })}
                        </span>
                        <button
                            className="button secondary compact"
                            disabled={syncing}
                            onClick={() => void synchronize()}
                        >
                            {TEXT.app.retrySync}
                        </button>
                    </div>
                )}
                {player.onboardingStage === "welcome" && (
                    <WelcomeScreen
                        onStart={() => dispatch(setStage("builder"))}
                    />
                )}
                {(player.onboardingStage === "builder" ||
                    player.onboardingStage === "acceptance") && (
                    <AdmissionFlow
                        player={player}
                        busy={busy}
                        error={error}
                        onSave={savePlayer}
                        onBack={(draft) => {
                            dispatch(
                                replacePlayer({
                                    ...draft,
                                    onboardingStage: "welcome",
                                }),
                            );
                            setError("");
                        }}
                        onEdit={() => setError("")}
                        onBegin={() => {
                            if (intro || saving.current) return;
                            setIntro({
                                from:
                                    mainRef.current?.querySelector<SVGElement>(
                                        "[data-admission-avatar] .avatar",
                                    ) ?? null,
                            });
                        }}
                    />
                )}
                {inDegree &&
                    (showGraduation ? (
                        <GraduationScreen
                            player={player}
                            ects={ects}
                            completedGameIds={progress.completedGameIds}
                            scores={progress.scores}
                            graduatedAt={progress.graduatedAt || null}
                            celebrate={celebrateGraduation}
                            preview={previewingGraduation}
                            submissionError={
                                previewingGraduation ? "" : syncError
                            }
                            submitting={syncing}
                            onRetry={() => void synchronize()}
                            onLeaderboard={() => setScoreboard(true)}
                            onReturn={() => {
                                setGraduation(false);
                                setPreviewingGraduation(false);
                            }}
                        />
                    ) : editingCharacter ? (
                        <CharacterBuilder
                            player={player}
                            busy={busy}
                            error={error}
                            onBack={() => {
                                setEditingCharacter(false);
                                setError("");
                            }}
                            onContinue={(draft) =>
                                void savePlayer({
                                    ...draft,
                                    onboardingStage: "main",
                                }).then((saved) => {
                                    if (saved) setEditingCharacter(false);
                                })
                            }
                        />
                    ) : (
                        <GameWorkspace
                            player={player}
                            progress={progress}
                            ects={ects}
                            eligible={eligible}
                            graduationPreview={graduationPreview}
                            busy={busy}
                            error={error}
                            selectedGame={selectedGame}
                            completionFeedback={completionFeedback}
                            onEditCharacter={() => {
                                setEditingCharacter(true);
                                setError("");
                                setNotice("");
                            }}
                            onScoreboard={() => setScoreboard(true)}
                            onOpen={(game) => {
                                setSelectedGame(game);
                                setError("");
                                setNotice("");
                            }}
                            onComplete={finishGame}
                            onExit={() => {
                                if (!saving.current) {
                                    setSelectedGame(null);
                                    setError("");
                                }
                            }}
                            onGraduate={graduate}
                        />
                    ))}
            </main>
            <footer className="site-footer">
                <span>
                    <Icon name="cap" size={16} /> {TEXT.app.footerDisclaimer}
                </span>
                <span>{TEXT.app.footerTagline}</span>
            </footer>
            {scoreboard && (
                <ScoreboardDialog onClose={() => setScoreboard(false)} />
            )}
            {intro && (
                <YearOneIntro
                    character={player.character}
                    from={intro.from}
                    onEnter={() =>
                        void savePlayer({
                            ...player,
                            onboardingStage: "main",
                        }).then((saved) => {
                            if (!saved) setIntro(null);
                        })
                    }
                    onDone={() => {
                        setIntro(null);
                        mainRef.current?.focus({ preventScroll: true });
                    }}
                />
            )}
        </div>
    );
}
