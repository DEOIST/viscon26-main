import { useEffect } from "react";

export default function App() {
    useEffect(() => {
        window.location.replace("/");
    }, []);
    return <p>Returning to campus enrollment…</p>;
}
