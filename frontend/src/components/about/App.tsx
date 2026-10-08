import Layout from "../common/Layout";
import styles from "./App.module.css";

export default function App() {
    return (
        <Layout title="About">
            <h1 className={styles.heading}>About</h1>
            <p>
                This page exists to show the multi-page setup:{" "}
                <code>src/pages/about.tsx</code> mounts{" "}
                <code>src/components/about/App.tsx</code>, and the build serves
                it at <code>/about</code>.
            </p>
        </Layout>
    );
}
