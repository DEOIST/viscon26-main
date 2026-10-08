import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import "../styles/global.css";

// Every src/pages/<name>.tsx is just `mountPage(App)`. Global CSS is pulled in here once.
export function mountPage(App: ComponentType) {
    const root = document.getElementById("root");
    if (!root)
        throw new Error(
            "#root not found; was this HTML generated from template.html?",
        );
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
