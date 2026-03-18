"use client";

import { useEffect, useEffectEvent } from "react";

type PollResult =
  | boolean
  | void
  | {
      shouldContinue?: boolean;
      nextDelayMs?: number;
      resetAttempts?: boolean;
    };

export function useConditionalPolling({
  enabled,
  poll,
  getDelayMs,
  maxAttempts,
  resumeImmediately = true,
}: {
  enabled: boolean;
  poll: (ctx: { attempt: number }) => Promise<PollResult> | PollResult;
  getDelayMs: (ctx: { attempt: number }) => number;
  maxAttempts?: number;
  resumeImmediately?: boolean;
}) {
  const pollEvent = useEffectEvent(poll);
  const getDelayMsEvent = useEffectEvent(getDelayMs);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let attempt = 0;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const scheduleNext = (delayMs?: number) => {
      if (cancelled) return;
      clearTimer();
      if (document.visibilityState !== "visible") return;

      const nextDelay = Math.max(0, Math.floor(delayMs ?? getDelayMsEvent({ attempt })));
      timer = window.setTimeout(async () => {
        if (cancelled || document.visibilityState !== "visible") return;

        const result = await pollEvent({ attempt });
        if (cancelled) return;

        const normalized =
          typeof result === "object" && result !== null
            ? result
            : { shouldContinue: result !== false };

        if (normalized.shouldContinue === false) return;

        attempt = normalized.resetAttempts ? 0 : attempt + 1;
        if (maxAttempts && attempt >= maxAttempts) return;

        scheduleNext(normalized.nextDelayMs);
      }, nextDelay);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleNext(resumeImmediately ? 0 : undefined);
      } else {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, maxAttempts, resumeImmediately]);
}
