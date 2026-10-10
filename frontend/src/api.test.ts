import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GAMES } from "./config";
import { defaultPlayer } from "./store";
import type { Snapshot } from "./types";

const flags = GAMES.map((game) => game.implemented);
beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    GAMES.forEach((game) => (game.implemented = true));
});
afterEach(() => {
    vi.unstubAllGlobals();
    GAMES.forEach((game, i) => (game.implemented = flags[i]));
});

it("retains an anonymous run identifier across module reloads", async () => {
    const first = await import("./api");
    const id = first.anonymousPlayerId();
    expect(localStorage.getItem("eth-simulator.player-id.v1")).toBe(id);
    vi.resetModules();
    expect((await import("./api")).anonymousPlayerId()).toBe(id);
});

it("reconciles a lost graduation response without repeating completion rewards or graduation", async () => {
    const { GAMES } = await import("./config");
    GAMES.forEach((game) => (game.implemented = true));
    const { api, anonymousPlayerId } = await import("./api");
    const snapshot: Snapshot = {
        player: { ...defaultPlayer, name: "Ada", onboardingStage: "main" },
        progress: {
            completedGameIds: GAMES.map((game) => game.id),
            scores: {},
            graduated: true,
        },
    };
    const remote = {
        completedGameIds: [] as string[],
        graduated: false,
        graduatedAt: null as string | null,
        ects: 0,
    };
    const completions: string[] = [];
    let graduations = 0;
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
        expect(url).toContain(`/players/${anonymousPlayerId()}`);
        expect(options.headers).not.toHaveProperty("X-CSRF-Token");
        if (options.method === "PUT")
            return Response.json({
                id: anonymousPlayerId(),
                profile: snapshot.player,
                progress: remote,
            });
        if (url.endsWith("/graduation")) {
            graduations++;
            remote.graduated = true;
            remote.graduatedAt = "2026-10-10T12:00:00Z";
            throw new TypeError("Response was lost after the server saved it");
        }
        const id = decodeURIComponent(url.split("/").at(-1)!);
        completions.push(id);
        remote.completedGameIds.push(id);
        remote.ects += GAMES.find((game) => game.id === id)!.ects;
        return Response.json(remote);
    });
    vi.stubGlobal("fetch", fetch);
    await expect(api.synchronize(snapshot)).rejects.toThrow(
        "Cannot reach the server",
    );
    const result = await api.synchronize(snapshot);
    await api.synchronize(snapshot); // Refresh/reconciliation uses the same record.
    expect(completions).toEqual(GAMES.map((game) => game.id));
    expect(graduations).toBe(1);
    expect(result).toMatchObject({
        graduated: true,
        graduatedAt: "2026-10-10T12:00:00Z",
    });
});
