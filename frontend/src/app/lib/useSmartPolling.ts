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

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    setIsRefreshing(true);

    try {
      await loadRef.current(controller.signal);
      setLastUpdatedAt(new Date());
    } catch {
      // The caller owns visible error state; polling should keep the UI alive.
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
      }
    }

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let controller: AbortController | null = null;
    let timer: number | null = null;

    const run = async () => {
      if (disposed || document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      setIsRefreshing(true);

      try {
        await loadRef.current(controller.signal);
        if (!controller.signal.aborted) {
          setLastUpdatedAt(new Date());
        }
      } catch {
        // The caller owns visible error state; polling retries on the next interval.
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false);
        }
      }
    };

    const schedule = () => {
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(run, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    run();
    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      controller?.abort();
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs]);

  return {
    isRefreshing,
    lastUpdatedAt,
    refresh,
  };
}
