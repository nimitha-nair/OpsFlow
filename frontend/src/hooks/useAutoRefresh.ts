import { useEffect, useRef } from "react";

interface UseAutoRefreshOptions {
  /** Poll interval while the tab is visible. Default 20s. */
  intervalMs?: number;
  /** Turn polling off (e.g. while a dialog/drag is mid-flight). Default true. */
  enabled?: boolean;
}

/**
 * Keep a screen near-live: call `onRefresh` on an interval while the tab is
 * visible, and immediately when the tab regains focus/visibility. Pauses
 * entirely while the tab is hidden (so it never burns Firestore reads in the
 * background), throttles focus-triggered refreshes, and skips a tick if the
 * previous refresh hasn't settled yet.
 *
 * `onRefresh` MUST do a SILENT refetch — it should not flip a full-screen
 * loading state — so the UI updates in place instead of flashing a skeleton.
 * The usual wiring is `() => setReloadKey((k) => k + 1)` paired with a render
 * guard that only shows the skeleton when there is no data yet.
 */
export function useAutoRefresh(
  onRefresh: () => void | Promise<void>,
  { intervalMs = 20_000, enabled = true }: UseAutoRefreshOptions = {},
): void {
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const inFlight = useRef(false);
  const lastRun = useRef(0);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const run = async () => {
      if (inFlight.current || document.visibilityState !== "visible") return;
      inFlight.current = true;
      lastRun.current = performance.now();
      try {
        await cb.current();
      } catch {
        // A failed background refresh keeps the last good data on screen.
      } finally {
        inFlight.current = false;
      }
    };

    const timer = window.setInterval(() => void run(), intervalMs);

    // Catch up the moment the user returns to the tab (throttled so rapid
    // focus/blur doesn't hammer the API).
    const onFocusOrVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (performance.now() - lastRun.current < 5_000) return;
      void run();
    };
    document.addEventListener("visibilitychange", onFocusOrVisible);
    window.addEventListener("focus", onFocusOrVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.removeEventListener("focus", onFocusOrVisible);
    };
  }, [intervalMs, enabled]);
}
