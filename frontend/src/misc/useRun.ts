// Each page reloads authoritative state; only the run id travels between documents.
import { useEffect } from "react";
import { apiGetRunById } from "./apiClient";
import { readRunId, runHref } from "./run";
import { useApi } from "./useApi";
export function useRun(allowGraduated = false) {
    const runId = readRunId();
    const result = useApi(
        () =>
            runId
                ? apiGetRunById(runId)
                : Promise.resolve({
                      data: null,
                      status: 404,
                      error: "Run not found",
                  }),
        [runId],
    );
    useEffect(() => {
        if (!runId || result.status === 404) window.location.replace("/");
        else if (result.data?.graduatedAt && !allowGraduated)
            window.location.replace(runHref("/graduation", result.data.id));
    }, [runId, result.status, result.data?.graduatedAt, allowGraduated]);
    return result;
}
