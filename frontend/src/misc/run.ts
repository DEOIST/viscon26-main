// The run id travels between pages as `?run=<id>`: every page is a full page load, so nothing
// else survives navigation. Read and build run links only through these helpers.

const RUN_PARAM = "run";

export function readRunId(): string | null {
    return new URLSearchParams(window.location.search).get(RUN_PARAM);
}

export function runHref(path: string, runId: string): string {
    return `${path}?${RUN_PARAM}=${encodeURIComponent(runId)}`;
}
