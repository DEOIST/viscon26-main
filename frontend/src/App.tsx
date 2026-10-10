import { useEffect, useRef, useState } from "react";
import { api, errorMessage, type SessionData } from "./api";
import { GAMES } from "./config";
import {
    AcceptanceScreen,
    CharacterBuilder,
    GraduationScreen,
    WelcomeScreen,
} from "./components/Screens";
import { AuthDialog, ScoreboardDialog } from "./components/Dialogs";
import { Icon } from "./components/Icon";
import GameWorkspace from "./components/GameWorkspace";
import {
    completeGame,
    defaultPlayer,
    markGraduated,
    readGuest,
    replacePlayer,
    replaceProgress,
    selectCanGraduate,
    selectEcts,
    setGuestPersistence,
    setStage,
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
    const [user, setUser] = useState<SessionData["user"]>(null);
    const [booting, setBooting] = useState(true);
    const [bootError, setBootError] = useState("");
    const [dialog, setDialog] = useState<"auth" | "scoreboard" | null>(null);
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);
    const [graduation, setGraduation] = useState(false);
    const [busy, setBusy] = useState(false);
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
    const saving = useRef(false);
    const mainRef = useRef<HTMLElement>(null);

    function applySession(data: SessionData, announce = false) {
        setGuestPersistence(!data.user);
        setUser(data.user);
        const snapshot = data.user
            ? {
                  player: data.profile || {
                      ...defaultPlayer,
                      onboardingStage: "builder" as const,
                  },
                  progress: data.progress,
              }
            : readGuest();
        dispatch(replacePlayer(snapshot.player));
        dispatch(replaceProgress(snapshot.progress));
        setSelectedGame(null);
        setGraduation(false);
        setError("");
        setDialog(null);
        if (announce)
            setNotice(
                data.user
                    ? "Signed in. Your account’s student record is loaded."
                    : "Signed out. Your browser’s guest record is loaded.",
            );
    }
    async function bootstrap() {
        setBooting(true);
        setBootError("");
        try {
            applySession(await api.session());
        } catch (err) {
            setBootError(errorMessage(err));
        } finally {
            setBooting(false);
        }
    }
    useEffect(() => {
        void bootstrap();
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
        if (!booting) {
            mainRef.current?.focus({ preventScroll: true });
            window.scrollTo({ top: 0 });
        }
    }, [player.onboardingStage, selectedGame?.id, graduation, booting]);

    async function savePlayer(next: Player) {
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        setError("");
        try {
            dispatch(replacePlayer(user ? await api.saveProfile(next) : next));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }
    async function finishGame() {
        if (!selectedGame || saving.current) return;
        if (progress.completedGameIds.includes(selectedGame.id)) {
            setSelectedGame(null);
            return;
        }
        if (!GAMES.find((game) => game.id === selectedGame.id)?.implemented) {
            setError("Placeholder previews cannot award ECTS.");
            return;
        }
        saving.current = true;
        setBusy(true);
        setError("");
        try {
            if (user)
                dispatch(replaceProgress(await api.complete(selectedGame.id)));
            else dispatch(completeGame(selectedGame.id));
            setSelectedGame(null);
            setNotice(
                "Minigame completed. ECTS earned. Your library chair misses you already.",
            );
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }
    async function graduate() {
        if (!eligible || saving.current) return;
        saving.current = true;
        setBusy(true);
        setError("");
        try {
            if (user) dispatch(replaceProgress(await api.graduate()));
            else dispatch(markGraduated());
            setGraduation(true);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }
    const inDegree = player.onboardingStage === "main";
    const gameScreen = inDegree && !graduation && !booting && !bootError;
    return (
        <div className={`app-shell ${gameScreen ? "game-screen" : ""}`}>
            <a className="skip-link" href="#main-content">
                Skip to content
            </a>
            <header className="topbar">
                <div className="brand">
                    <span className="brand-icon">
                        <Icon name="cap" size={25} />
                    </span>
                    <span>
                        ETH SIMULATOR<small>AFTER HOURS</small>
                    </span>
                </div>
                <nav className="top-actions" aria-label="Application actions">
                    {!inDegree && (
                        <>
                            <button
                                className="button ghost compact"
                                aria-label="Scoreboard"
                                onClick={() => setDialog("scoreboard")}
                                disabled={booting || !!bootError}
                            >
                                <Icon name="trophy" size={17} />
                                <span className="nav-label">Scoreboard</span>
                            </button>
                            <button
                                className="button ghost compact"
                                onClick={() => setDialog("auth")}
                                disabled={booting || !!bootError || busy}
                            >
                                <Icon name="user" size={17} />
                                {user ? "Account" : "Log in / Register"}
                            </button>
                        </>
                    )}
                    <button
                        className="icon-button theme-button"
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
            <main id="main-content" ref={mainRef} tabIndex={-1}>
                {booting ? (
                    <div className="loading-screen" role="status">
                        <span className="loading-mark">
                            <Icon name="cap" size={38} />
                        </span>
                        <p>Finding your student record…</p>
                    </div>
                ) : bootError ? (
                    <div className="connection-panel panel">
                        <Icon name="slot" size={38} />
                        <h1>The admissions office is offline.</h1>
                        <p role="alert">{bootError}</p>
                        <div className="form-actions">
                            <button
                                className="button secondary"
                                onClick={() => void bootstrap()}
                            >
                                Try again
                            </button>
                            <button
                                className="button primary"
                                onClick={() => {
                                    setGuestPersistence(true);
                                    setBootError("");
                                    setNotice(
                                        "Guest mode is available. Account features need the server connection.",
                                    );
                                }}
                            >
                                Continue as guest <Icon name="arrow" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {notice && (
                            <div className="notice" role="status">
                                <span>{notice}</span>
                                <button
                                    className="icon-button"
                                    onClick={() => setNotice("")}
                                    aria-label="Dismiss message"
                                >
                                    <Icon name="close" size={16} />
                                </button>
                            </div>
                        )}
                        {player.onboardingStage === "welcome" && (
                            <WelcomeScreen
                                onStart={() => dispatch(setStage("builder"))}
                            />
                        )}
                        {player.onboardingStage === "builder" && (
                            <CharacterBuilder
                                player={player}
                                busy={busy}
                                error={error}
                                onBack={(draft) => {
                                    dispatch(
                                        replacePlayer({
                                            ...draft,
                                            onboardingStage: "welcome",
                                        }),
                                    );
                                    setError("");
                                }}
                                onContinue={(next) => void savePlayer(next)}
                            />
                        )}
                        {player.onboardingStage === "acceptance" && (
                            <AcceptanceScreen
                                player={player}
                                busy={busy}
                                error={error}
                                onBack={() => {
                                    dispatch(setStage("builder"));
                                    setError("");
                                }}
                                onBegin={() =>
                                    void savePlayer({
                                        ...player,
                                        onboardingStage: "main",
                                    })
                                }
                            />
                        )}
                        {inDegree &&
                            (graduation ? (
                                <GraduationScreen
                                    player={player}
                                    ects={ects}
                                    onReturn={() => setGraduation(false)}
                                />
                            ) : (
                                <>
                                    <GameWorkspace
                                        player={player}
                                        progress={progress}
                                        ects={ects}
                                        eligible={eligible}
                                        authenticated={!!user}
                                        busy={busy}
                                        error={error}
                                        selectedGame={selectedGame}
                                        onAccount={() => setDialog("auth")}
                                        onEditCharacter={() => {
                                            dispatch(setStage("builder"));
                                            setError("");
                                            setNotice("");
                                        }}
                                        onScoreboard={() =>
                                            setDialog("scoreboard")
                                        }
                                        onOpen={(game) => {
                                            setSelectedGame(game);
                                            setError("");
                                            setNotice("");
                                        }}
                                        onComplete={() => void finishGame()}
                                        onExit={() => {
                                            if (!saving.current) {
                                                setSelectedGame(null);
                                                setError("");
                                            }
                                        }}
                                        onGraduate={() => void graduate()}
                                    />
                                </>
                            ))}
                    </>
                )}
            </main>
            <footer className="site-footer">
                <span>
                    <Icon name="cap" size={16} /> Unofficial student parody. No
                    affiliation with or endorsement by ETH Zürich.
                </span>
                <span>Made for the plot. And the credits.</span>
            </footer>
            {dialog === "auth" && (
                <AuthDialog
                    authenticated={!!user}
                    onClose={() => setDialog(null)}
                    onSession={(data) => applySession(data, true)}
                />
            )}
            {dialog === "scoreboard" && (
                <ScoreboardDialog onClose={() => setDialog(null)} />
            )}
        </div>
    );
}
