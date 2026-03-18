"use client";

import { startTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function useVisibilityAwareRouterRefresh({
  minIntervalMs = 5_000,
}: {
  minIntervalMs?: number;
} = {}) {
  const router = useRouter();
  const lastRefreshAtRef = useRef(0);
  const pendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const requestRefresh = useCallback(() => {
    if (typeof document === "undefined") return;

    const runRefresh = () => {
      pendingRef.current = false;
      clearTimer();
      lastRefreshAtRef.current = Date.now();
      startTransition(() => {
        router.refresh();
      });
    };

    const queueRetry = (delayMs: number) => {
      pendingRef.current = true;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;

        if (document.visibilityState !== "visible") {
          pendingRef.current = true;
          return;
        }

        const remainingMs = Math.max(0, minIntervalMs - (Date.now() - lastRefreshAtRef.current));
        if (remainingMs > 0) {
          queueRetry(remainingMs);
          return;
        }

        runRefresh();
      }, delayMs);
    };

    if (document.visibilityState !== "visible") {
      pendingRef.current = true;
      clearTimer();
      return;
    }

    const remainingMs = Math.max(0, minIntervalMs - (Date.now() - lastRefreshAtRef.current));
    if (remainingMs > 0) {
      queueRetry(remainingMs);
      return;
    }

    runRefresh();
  }, [clearTimer, minIntervalMs, router]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && pendingRef.current) {
        requestRefresh();
      } else if (document.visibilityState !== "visible") {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [clearTimer, requestRefresh]);

  return requestRefresh;
}
