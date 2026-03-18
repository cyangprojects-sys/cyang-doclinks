"use client";

export const SECURITY_REFRESH_WATCH_EVENT = "cyang:security-refresh-watch";
export const DEFAULT_SECURITY_REFRESH_WATCH_MS = 120_000;

export function dispatchSecurityRefreshWatch(ttlMs = DEFAULT_SECURITY_REFRESH_WATCH_MS) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SECURITY_REFRESH_WATCH_EVENT, {
      detail: { ttlMs },
    })
  );
}
