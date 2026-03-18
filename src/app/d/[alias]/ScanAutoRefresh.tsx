"use client";

import { useStatusSignaturePolling } from "@/hooks/useStatusSignaturePolling";
import { useVisibilityAwareRouterRefresh } from "@/hooks/useVisibilityAwareRouterRefresh";

const REFRESH_DELAY_MS = 5_000;
const MAX_SCAN_REFRESH_MS = 60_000;
const MAX_SCAN_REFRESH_ATTEMPTS = 20;

type AliasAvailabilityResponse =
  | {
      ok: true;
      status_signature: string;
      should_auto_refresh: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export default function ScanAutoRefresh({
  alias,
  initialSignature,
}: {
  alias: string;
  initialSignature?: string | null;
}) {
  const requestRefresh = useVisibilityAwareRouterRefresh({ minIntervalMs: REFRESH_DELAY_MS });

  useStatusSignaturePolling<Extract<AliasAvailabilityResponse, { ok: true }>>({
    enabled: true,
    initialSignature: initialSignature ?? null,
    getDelayMs: ({ attempt }) => Math.min(REFRESH_DELAY_MS * 2 ** attempt, MAX_SCAN_REFRESH_MS),
    maxAttempts: MAX_SCAN_REFRESH_ATTEMPTS,
    fetchSnapshot: async () => {
      const res = await fetch(`/api/d/${encodeURIComponent(alias)}/availability`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as AliasAvailabilityResponse | null;
      if (!res.ok || !json || json.ok !== true) return null;
      return json;
    },
    getSignature: (snapshot) => snapshot.status_signature,
    evaluate: (snapshot, ctx) => {
      if (ctx.signatureChanged) {
        requestRefresh();
      }
      return {
        shouldContinue: snapshot.should_auto_refresh,
      };
    },
  });

  return null;
}
