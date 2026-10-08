import { useCallback, useEffect, useState } from "react";
import type { ApiResult } from "./CommonInt";

// Runs an `api<Name>` call when the component mounts and whenever `deps` change.
// `reload()` runs it again (e.g. after a mutation). Previous data stays visible while reloading.
//
//     const items = useApi(apiListItems);
//     const item = useApi(() => apiGetItemById(itemId), [itemId]);
export function useApi<T>(
    call: () => Promise<ApiResult<T>>,
    deps: unknown[] = [],
) {
    const [result, setResult] = useState<ApiResult<T> | null>(null);
    const [loading, setLoading] = useState(true);
    const [reloadCount, setReloadCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        call().then((res) => {
            if (cancelled) return;
            setResult(res);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [...deps, reloadCount]);

    const reload = useCallback(() => setReloadCount((count) => count + 1), []);

    return {
        data: result?.data ?? null,
        status: result?.status ?? null,
        error: result?.error ?? null,
        loading,
        reload,
    };
}
