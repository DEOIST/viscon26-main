// "Ask the dealer": a chat with the AI dealer at the blackjack table, with an optional voice.
// Only the shell renders it; the game itself never talks to the server.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import type { CompanionReply } from "../misc/CommonInt";
import { Icon } from "./Icon";
import styles from "./CompanionChat.module.css";

const MAX_QUESTION = 200;
const SUGGESTIONS = [
    "How do I win a hand?",
    "How much should I bet?",
    "Tell me a joke about ETH.",
];

type Message =
    | { kind: "player"; key: string; text: string }
    | ({ kind: "dealer"; key: string } & CompanionReply);

interface CompanionChatArgs {
    playerName: string;
}

export default function CompanionChat(args: CompanionChatArgs) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [readAloud, setReadAloud] = useState(false);
    const [speakingId, setSpeakingId] = useState<string | null>(null);
    const audio = useRef<HTMLAudioElement | null>(null);
    const audioUrl = useRef<string | null>(null);
    const list = useRef<HTMLOListElement>(null);

    function stopAudio() {
        audio.current?.pause();
        audio.current = null;
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = null;
        setSpeakingId(null);
    }
    useEffect(() => stopAudio, []);
    useEffect(() => {
        list.current?.lastElementChild?.scrollIntoView?.({ block: "end" });
    }, [messages, sending]);

    async function handleSpeak(replyId: string) {
        stopAudio();
        setSpeakingId(replyId);
        setError("");
        try {
            const url = await api.companionSpeech(replyId);
            audioUrl.current = url;
            const player = new Audio(url);
            audio.current = player;
            player.onended = stopAudio;
            await player.play();
        } catch (err) {
            stopAudio();
            setError(errorMessage(err));
        }
    }

    async function ask(question: string) {
        const text = question.trim();
        if (!text || sending) return;
        setSending(true);
        setError("");
        setDraft("");
        setMessages((current) => [
            ...current,
            { kind: "player", key: `q${current.length}`, text },
        ]);
        try {
            const reply = await api.askCompanion(text);
            setMessages((current) => [
                ...current,
                { kind: "dealer", key: reply.id, ...reply },
            ]);
            if (readAloud && reply.source === "ai") void handleSpeak(reply.id);
        } catch (err) {
            setError(errorMessage(err));
            setDraft(text);
        } finally {
            setSending(false);
        }
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        void ask(draft);
    }

    if (!isOpen)
        return (
            <button className={styles.launcher} onClick={() => setIsOpen(true)}>
                <Icon name="chat" size={18} /> Ask the dealer
            </button>
        );

    return (
        <section className={styles.panel} aria-label="Ask the dealer">
            <header className={styles.header}>
                <h2>Ask the dealer</h2>
                <label className={styles.voiceToggle}>
                    <input
                        type="checkbox"
                        checked={readAloud}
                        onChange={(event) => setReadAloud(event.target.checked)}
                    />
                    Read answers aloud
                </label>
                <button
                    className="icon-button"
                    aria-label="Close the dealer chat"
                    onClick={() => {
                        stopAudio();
                        setIsOpen(false);
                    }}
                >
                    <Icon name="close" size={16} />
                </button>
            </header>
            <ol className={styles.messages} ref={list} aria-live="polite">
                {messages.length === 0 && (
                    <li className={styles.intro}>
                        The dealer leans over the felt. “Questions,{" "}
                        {args.playerName}? Rules, bets, life advice. Ask.”
                    </li>
                )}
                {messages.map((message) =>
                    message.kind === "player" ? (
                        <li key={message.key} className={styles.player}>
                            {message.text}
                        </li>
                    ) : (
                        <li key={message.key} className={styles.dealer}>
                            <span>{message.answer}</span>
                            {message.source === "ai" ? (
                                <button
                                    className={styles.listen}
                                    onClick={() =>
                                        speakingId === message.id
                                            ? stopAudio()
                                            : void handleSpeak(message.id)
                                    }
                                    aria-label={
                                        speakingId === message.id
                                            ? "Stop the dealer's voice"
                                            : "Listen to this answer"
                                    }
                                >
                                    <Icon name="speaker" size={15} />
                                    {speakingId === message.id
                                        ? "Stop"
                                        : "Listen"}
                                </button>
                            ) : (
                                <small className={styles.offline}>
                                    Pre-written: the AI dealer is offline
                                </small>
                            )}
                        </li>
                    ),
                )}
                {sending && (
                    <li className={styles.dealer} role="status">
                        The dealer is thinking…
                    </li>
                )}
            </ol>
            {messages.length === 0 && (
                <div className={styles.suggestions}>
                    {SUGGESTIONS.map((suggestion) => (
                        <button
                            key={suggestion}
                            className="button ghost compact"
                            disabled={sending}
                            onClick={() => void ask(suggestion)}
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}
            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}
            <form className={styles.form} onSubmit={handleSubmit}>
                <input
                    value={draft}
                    maxLength={MAX_QUESTION}
                    placeholder="Ask about the rules, your bet, ETH…"
                    aria-label="Your question for the dealer"
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={sending}
                    autoFocus
                />
                <button
                    className="button primary compact"
                    disabled={sending || !draft.trim()}
                >
                    Ask
                </button>
            </form>
        </section>
    );
}
