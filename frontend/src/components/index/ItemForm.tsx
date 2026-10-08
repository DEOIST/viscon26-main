import { useState, type FormEvent } from "react";
import type { ItemWHid } from "../../misc/CommonInt";
import styles from "./ItemForm.module.css";

interface ItemFormArgs {
    // Resolves to true on success, so the form knows whether to clear itself.
    onSubmit: (payload: ItemWHid) => Promise<boolean>;
}

export default function ItemForm(args: ItemFormArgs) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        const ok = await args.onSubmit({
            title: title.trim(),
            description: description.trim(),
        });
        setSubmitting(false);
        if (ok) {
            setTitle("");
            setDescription("");
        }
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <input
                className={styles.input}
                placeholder="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
            />
            <textarea
                className={styles.input}
                placeholder="Description (optional)"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
            />
            <button
                className={styles.submitButton}
                type="submit"
                disabled={submitting}
            >
                {submitting ? "Adding…" : "Add item"}
            </button>
        </form>
    );
}
