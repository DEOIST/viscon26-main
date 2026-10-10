// Use browser storage in jsdom even on Node versions with their own localStorage getter.
Object.defineProperty(globalThis, "localStorage", {
    value: (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window
        .localStorage,
    configurable: true,
});
