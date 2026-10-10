import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./Icon";
import { shellClass } from "../../misc/shellStyles";

interface DialogArgs {
    title: string;
    children: ReactNode;
    onClose(): void;
}
export default function Dialog(args: DialogArgs) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current!;
        const trigger = document.activeElement as HTMLElement | null;
        dialog.showModal();
        dialog.querySelector<HTMLElement>("button")?.focus();
        return () => {
            dialog.close();
            trigger?.focus();
        };
    }, []);
    return (
        <dialog
            className={shellClass("dialog dialog-wide")}
            ref={ref}
            aria-labelledby="dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                args.onClose();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) args.onClose();
            }}
        >
            <div className={shellClass("dialog-inner")}>
                <div className={shellClass("dialog-heading")}>
                    <h2 id="dialog-title">{args.title}</h2>
                    <button
                        className={shellClass("icon-button")}
                        aria-label="Close dialog"
                        onClick={args.onClose}
                    >
                        <Icon name="close" />
                    </button>
                </div>
                {args.children}
            </div>
        </dialog>
    );
}
