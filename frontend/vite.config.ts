import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, "..", "");
    return {
        plugins: [react()],
        envDir: "..",
        build: { emptyOutDir: false },
        server: {
            port: 5173,
            strictPort: true,
            proxy: {
                "/api": {
                    target:
                        process.env.API_PROXY_TARGET ||
                        env.API_PROXY_TARGET ||
                        "http://127.0.0.1:8000",
                    changeOrigin: false,
                },
            },
        },
        test: {
            environment: "jsdom",
            globals: true,
            restoreMocks: true,
            setupFiles: ["./src/test-setup.ts"],
        },
    };
});
