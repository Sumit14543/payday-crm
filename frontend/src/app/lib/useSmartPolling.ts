import { useCallback, useEffect, useRef, useState } from "react";

type PollingOptions = {
  enabled?: boolean;
  intervalMs?: number;
};

export function useSmartPolling(load: (signal: AbortSignal) => Promise<void>, options: PollingOptions = {}) {
  const { enabled = true, intervalMs = 60_000 } = options;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const loadRef = useRef(load);
  const pendingRef = useRef<{ load: typeof load; controller: AbortController; promise: Promise<void>; started: boolean } | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRef.current?.controller.abort();
      pendingRef.current = null;
    };
  }, []);

  const runRefresh = useCallback((force: boolean): Promise<void> => {
    if (!mountedRef.current) return Promise.resolve();
    const currentLoad = loadRef.current;
    const pending = pendingRef.current;
    // Polling shares an active request; initial effects share queued work.
    // Manual refresh and changed filters cancel obsolete work.
    if (pending?.load === currentLoad && (!force || !pending.started)) return pending.promise;
    pending?.controller.abort();
    const controller = new AbortController();
    const next = { load: currentLoad, controller, promise: Promise.resolve(), started: false };
    pendingRef.current = next;
    setIsRefreshing(true);
    next.promise = Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        next.started = true;
        return currentLoad(controller.signal);
      }
    }).then(() => {
      if (!controller.signal.aborted && mountedRef.current) setLastUpdatedAt(new Date());
    }).catch(() => {
      // The caller owns visible error state; polling should keep the UI alive.
    }).finally(() => {
      if (pendingRef.current === next) {
        pendingRef.current = null;
        if (mountedRef.current) setIsRefreshing(false);
      }
    });
    return next.promise;
  }, []);

  const refresh = useCallback(() => runRefresh(true), [runRefresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    const run = () => {
      if (document.visibilityState !== "hidden") void runRefresh(false);
    };

    run();
    const timer = window.setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
      pendingRef.current?.controller.abort();
      pendingRef.current = null;
      if (mountedRef.current) setIsRefreshing(false);
    };
  }, [enabled, intervalMs, runRefresh]);

  return {
    isRefreshing,
    lastUpdatedAt,
    refresh,
  };
}
