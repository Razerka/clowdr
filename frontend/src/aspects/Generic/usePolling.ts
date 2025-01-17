import { useCallback, useEffect, useMemo, useState } from "react";

export default function usePolling(
    f: () => unknown,
    pollInterval: number,
    defaultIsPolling = true
): {
    start: () => void;
    stop: () => void;
    toggle: () => void;
    isPolling: boolean;
} {
    const [isPolling, setIsPolling] = useState<boolean>(defaultIsPolling);

    const start = useCallback(() => setIsPolling(true), []);
    const stop = useCallback(() => setIsPolling(false), []);
    const toggle = useCallback(() => setIsPolling((old) => !old), []);

    useEffect(() => {
        const intervalId = (() => {
            if (isPolling) {
                return setInterval(() => {
                    f();
                }, pollInterval);
            }
            return undefined;
        })();
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [f, isPolling, pollInterval]);

    const pollingObj = useMemo(
        () => ({
            isPolling,
            start,
            stop,
            toggle,
        }),
        [isPolling, start, stop, toggle]
    );

    return pollingObj;
}
