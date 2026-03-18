"use client";

import { useEffect, useRef, useState } from "react";
import { useStatusSignaturePolling } from "@/hooks/useStatusSignaturePolling";
import { useVisibilityAwareRouterRefresh } from "@/hooks/useVisibilityAwareRouterRefresh";
import {
  DEFAULT_SECURITY_REFRESH_WATCH_MS,
  SECURITY_REFRESH_WATCH_EVENT,
} from "./securityRefreshWatch";

type SignaturesResponse =
  | {
      ok: true;
      signatures: {
        securityEvents: string;
        deadLetter: string;
        quarantinedDocs: string;
        orgMembership: string;
        rbacOverrides: string;
      };
      has_active_work: boolean;
    }
  | { ok: false; error: string };

const SECURITY_POLL_MS = 60_000;

export default function SecurityTablesAutoRefresh({
  initialActiveWork = false,
}: {
  initialActiveWork?: boolean;
}) {
  const requestRefresh = useVisibilityAwareRouterRefresh({ minIntervalMs: 15_000 });
  const watchUntilRef = useRef(0);
  const [watchEnabled, setWatchEnabled] = useState(initialActiveWork);

  useEffect(() => {
    const onWatch = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const ttlMs = Number(detail?.ttlMs || DEFAULT_SECURITY_REFRESH_WATCH_MS);
      watchUntilRef.current = Date.now() + Math.max(15_000, ttlMs);
      setWatchEnabled(true);
    };

    window.addEventListener(SECURITY_REFRESH_WATCH_EVENT, onWatch);
    return () => {
      window.removeEventListener(SECURITY_REFRESH_WATCH_EVENT, onWatch);
    };
  }, []);

  useStatusSignaturePolling<Extract<SignaturesResponse, { ok: true }>>({
    enabled: watchEnabled,
    getDelayMs: () => SECURITY_POLL_MS,
    fetchSnapshot: async () => {
      const res = await fetch("/api/admin/security/table-signatures", {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as SignaturesResponse | null;
      if (!res.ok || !json || json.ok !== true) return null;
      return json;
    },
    getSignature: (snapshot) => JSON.stringify(snapshot.signatures),
    evaluate: (snapshot, ctx) => {
      if (ctx.signatureChanged) {
        watchUntilRef.current = Date.now() + DEFAULT_SECURITY_REFRESH_WATCH_MS;
        requestRefresh();
      }

      const keepWatching = snapshot.has_active_work || Date.now() < watchUntilRef.current;
      if (!keepWatching) setWatchEnabled(false);
      return {
        shouldContinue: keepWatching,
      };
    },
  });

  return null;
}
