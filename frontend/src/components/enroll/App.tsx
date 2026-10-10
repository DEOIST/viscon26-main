import { useRef, useState } from "react";
import ShellLayout from "../common/ShellLayout";
import CharacterBuilder from "./CharacterBuilder";
import AcceptanceScreen from "./AcceptanceScreen";
import { DEFAULT_CHARACTER } from "../../misc/shellConfig";
import { apiCreateRun } from "../../misc/apiClient";
import { runHref } from "../../misc/run";

export default function App() {
    const [character, setCharacter] = useState(DEFAULT_CHARACTER);
    const [accepted, setAccepted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const saving = useRef(false);
    async function handleBegin() {
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        setError("");
        const result = await apiCreateRun({
            character: { ...character, name: character.name.trim() },
        });
        if (result.data)
            window.location.href = runHref("/campus", result.data.id);
        else {
            setError(result.error || "Your student record could not be saved.");
            saving.current = false;
            setBusy(false);
        }
    }
    return (
        <ShellLayout title="Enroll">
            {accepted ? (
                <AcceptanceScreen
                    character={character}
                    busy={busy}
                    error={error}
                    onBegin={() => void handleBegin()}
                    onBack={() => {
                        setAccepted(false);
                        setError("");
                    }}
                />
            ) : (
                <CharacterBuilder
                    character={character}
                    busy={busy}
                    error={error}
                    onChange={setCharacter}
                    onContinue={() => {
                        setCharacter((current) => ({
                            ...current,
                            name: current.name.trim(),
                        }));
                        setAccepted(true);
                    }}
                />
            )}
        </ShellLayout>
    );
}
