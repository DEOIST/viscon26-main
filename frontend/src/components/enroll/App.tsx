// Character creator. SKELETON for the "Screen Character builder" work (issue #7): the character
// is saved through `POST /api/runs` (no client store), then the run id travels as ?run=.

import { useState, type FormEvent } from "react";
import Avatar from "../common/Avatar";
import Layout from "../common/Layout";
import { apiCreateRun } from "../../misc/apiClient";
import {
    ARCHETYPES,
    AVATARS,
    DEPARTMENTS,
    PRONOUN_OPTIONS,
} from "../../misc/character";
import { runHref } from "../../misc/run";
import type {
    ArchetypeId,
    Character,
    DepartmentId,
} from "../../misc/CommonInt";
import styles from "./App.module.css";

const DEFAULT_CHARACTER: Character = {
    name: "",
    pronouns: "they",
    department: "infk",
    archetype: "nerd",
    avatar: "a1",
};

export default function App() {
    const [character, setCharacter] = useState<Character>(DEFAULT_CHARACTER);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function update(change: Partial<Character>) {
        setCharacter((current) => ({ ...current, ...change }));
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        const res = await apiCreateRun({ character });
        if (res.data === null) {
            setError(res.error);
            setSubmitting(false);
            return;
        }
        window.location.href = runHref("/campus", res.data.id);
    }

    return (
        <Layout title="Enroll">
            <h1>Enroll at ETH</h1>
            <div className={styles.legi}>
                <Avatar
                    avatar={character.avatar}
                    name={character.name}
                    isLarge
                />
                <div>
                    <strong>{character.name || "Your name"}</strong>
                    <div className={styles.muted}>
                        {DEPARTMENTS[character.department]}
                    </div>
                    <div className={styles.muted}>
                        {ARCHETYPES[character.archetype].label} ·{" "}
                        {character.pronouns}
                    </div>
                </div>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
                <label className={styles.field}>
                    Name
                    <input
                        value={character.name}
                        maxLength={20}
                        required
                        onChange={(event) =>
                            update({ name: event.target.value })
                        }
                    />
                    <small className={styles.muted}>
                        Letters, digits, spaces and . ' _ - (up to 20). The
                        rector reads it aloud at graduation.
                    </small>
                </label>

                <fieldset className={styles.field}>
                    <legend>Pronouns</legend>
                    {PRONOUN_OPTIONS.map((pronouns) => (
                        <label key={pronouns} className={styles.choice}>
                            <input
                                type="radio"
                                name="pronouns"
                                checked={character.pronouns === pronouns}
                                onChange={() => update({ pronouns })}
                            />
                            {pronouns}
                        </label>
                    ))}
                </fieldset>

                <label className={styles.field}>
                    Department
                    <select
                        value={character.department}
                        onChange={(event) =>
                            update({
                                department: event.target.value as DepartmentId,
                            })
                        }
                    >
                        {Object.entries(DEPARTMENTS).map(([id, label]) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>

                <fieldset className={styles.field}>
                    <legend>Archetype</legend>
                    {Object.entries(ARCHETYPES).map(([id, archetype]) => (
                        <label key={id} className={styles.choice}>
                            <input
                                type="radio"
                                name="archetype"
                                checked={character.archetype === id}
                                onChange={() =>
                                    update({ archetype: id as ArchetypeId })
                                }
                            />
                            <strong>{archetype.label}</strong>
                            <span className={styles.muted}>
                                {archetype.perk}
                            </span>
                        </label>
                    ))}
                </fieldset>

                <fieldset className={styles.field}>
                    <legend>Avatar</legend>
                    <div className={styles.avatars}>
                        {AVATARS.map((avatar) => (
                            <button
                                key={avatar}
                                type="button"
                                aria-label={`Avatar ${avatar}`}
                                aria-pressed={character.avatar === avatar}
                                className={
                                    character.avatar === avatar
                                        ? styles.avatarPicked
                                        : styles.avatarButton
                                }
                                onClick={() => update({ avatar })}
                            >
                                <Avatar avatar={avatar} name={character.name} />
                            </button>
                        ))}
                    </div>
                </fieldset>

                {error && <p className={styles.error}>{error}</p>}
                <button
                    type="submit"
                    className={styles.primary}
                    disabled={submitting}
                >
                    {submitting ? "Matriculating…" : "Matriculate"}
                </button>
            </form>
        </Layout>
    );
}
