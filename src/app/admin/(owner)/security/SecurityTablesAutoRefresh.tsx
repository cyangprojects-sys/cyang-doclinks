"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConditionalPolling } from "@/hooks/useConditionalPolling";
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
  const router = useRouter();
  const previousSignatureRef = useRef<string | null>(null);
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

  useConditionalPolling({
    enabled: watchEnabled,
    getDelayMs: () => SECURITY_POLL_MS,
    poll: async () => {
      try {
        const res = await fetch("/api/admin/security/table-signatures", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as SignaturesResponse | null;
        if (!res.ok || !json || json.ok !== true) return true;

        const currentSignature = JSON.stringify(json.signatures);
        const signatureChanged =
          Boolean(previousSignatureRef.current) && currentSignature !== previousSignatureRef.current;

        previousSignatureRef.current = currentSignature;
        if (signatureChanged) {
          // A real table change merits one authoritative server refresh, then the watcher keeps
          // running only while there is still background security work or a short post-action watch window.
          watchUntilRef.current = Date.now() + DEFAULT_SECURITY_REFRESH_WATCH_MS;
          router.refresh();
        }

        const keepWatching = json.has_active_work || Date.now() < watchUntilRef.current;
        if (!keepWatching) setWatchEnabled(false);
        return keepWatching;
      } catch {
        return true;
      }
    },
  });

  return null;
}
