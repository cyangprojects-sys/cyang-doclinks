"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
    }
  | { ok: false; error: string };

// Owner security tables stay self-updating, but not on a cadence that keeps the DB warm unnecessarily.
const POLL_MS = 60_000;

export default function SecurityTablesAutoRefresh() {
  const router = useRouter();
  const previousSignatureRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/security/table-signatures", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as SignaturesResponse | null;
        if (cancelled || !res.ok || !json || json.ok !== true) return;

        const currentSignature = JSON.stringify(json.signatures);
        if (!previousSignatureRef.current) {
          previousSignatureRef.current = currentSignature;
          return;
        }
        if (currentSignature === previousSignatureRef.current) return;

        previousSignatureRef.current = currentSignature;
        if (refreshInFlightRef.current) return;
        refreshInFlightRef.current = true;
        router.refresh();
        window.setTimeout(() => {
          refreshInFlightRef.current = false;
        }, 1500);
      } catch {
        // best-effort polling
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
