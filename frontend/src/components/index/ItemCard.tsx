import type { Item } from "../../misc/CommonInt";
import styles from "./ItemCard.module.css";

interface ItemCardArgs {
    item: Item;
    onDelete: (itemId: string) => void;
}

export default function ItemCard(args: ItemCardArgs) {
    const createdAt = new Date(args.item.createdAt).toLocaleString();

    return (
        <article className={styles.card}>
            <div>
                <h3 className={styles.title}>{args.item.title}</h3>
                {args.item.description && (
                    <p className={styles.description}>
                        {args.item.description}
                    </p>
                )}
                <time className={styles.meta}>{createdAt}</time>
            </div>
            <button
                className={styles.deleteButton}
                onClick={() => args.onDelete(args.item.id)}
            >
                Delete
            </button>
        </article>
    );
}
