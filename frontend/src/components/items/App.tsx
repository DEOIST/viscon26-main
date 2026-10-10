// Example page: a full round trip through the stack (FastAPI → apiClient → useApi → UI).
// Replace it with your real home page; delete ItemCard/ItemForm with the items feature.

import { useState } from "react";
import Layout from "../common/Layout";
import ItemCard from "../index/ItemCard";
import ItemForm from "../index/ItemForm";
import {
    apiCreateItem,
    apiDeleteItem,
    apiGetHealth,
    apiListItems,
} from "../../misc/apiClient";
import { useApi } from "../../misc/useApi";
import type { ItemWHid } from "../../misc/CommonInt";
import styles from "./App.module.css";

export default function App() {
    const health = useApi(apiGetHealth);
    const items = useApi(apiListItems);
    const [actionError, setActionError] = useState<string | null>(null);

    async function handleCreate(payload: ItemWHid) {
        const res = await apiCreateItem(payload);
        setActionError(res.error);
        if (res.error === null) items.reload();
        return res.error === null;
    }

    async function handleDelete(itemId: string) {
        const res = await apiDeleteItem(itemId);
        setActionError(res.error);
        items.reload();
    }

    return (
        <Layout title="Home">
            <p className={styles.status}>
                Backendd:{" "}
                {health.loading ? (
                    "checking…"
                ) : health.error ? (
                    <span className={styles.error}>
                        unreachable ({health.error})
                    </span>
                ) : (
                    <span className={styles.ok}>
                        {health.data?.status} ({health.data?.environment})
                    </span>
                )}
            </p>

            <ItemForm onSubmit={handleCreate} />
            {actionError && <p className={styles.error}>{actionError}</p>}

            <section className={styles.list}>
                {items.loading && items.data === null && (
                    <p className={styles.muted}>Loading…</p>
                )}
                {items.data?.length === 0 && (
                    <p className={styles.muted}>No items yet.</p>
                )}
                {items.data?.map((item) => (
                    <ItemCard
                        key={item.id}
                        item={item}
                        onDelete={handleDelete}
                    />
                ))}
            </section>
        </Layout>
    );
}
