"use client";

import { useMemo } from "react";
import { useStatusSignaturePolling } from "@/hooks/useStatusSignaturePolling";
import {
  getDocumentCollectionSignature,
  type DocumentStatusCollection,
  type DocumentStatusSnapshot,
} from "@/lib/documentTransientState";

type AdminDocumentStatusResponse =
  | (DocumentStatusCollection<DocumentStatusSnapshot> & {
      ok: true;
      missing_doc_ids: string[];
    })
  | {
      ok: false;
      error: string;
      message?: string;
    };

export function useAdminDocumentStatusPolling({
  docIds,
  pollMs,
  initialSignature = null,
  enabled = true,
  onSnapshot,
}: {
  docIds: string[];
  pollMs: number;
  initialSignature?: string | null;
  enabled?: boolean;
  onSnapshot: (
    payload: Extract<AdminDocumentStatusResponse, { ok: true }>,
    ctx: {
      attempt: number;
      signature: string;
      previousSignature: string | null;
      signatureChanged: boolean;
      isInitial: boolean;
    }
  ) => {
    shouldContinue?: boolean;
    nextDelayMs?: number;
    resetAttempts?: boolean;
  } | boolean | void;
}) {
  const stableDocIds = useMemo(
    () =>
      docIds
        .map((docId) => String(docId || "").trim())
        .filter(Boolean)
        .sort(),
    [docIds]
  );
  useStatusSignaturePolling<Extract<AdminDocumentStatusResponse, { ok: true }>>({
    enabled: enabled && stableDocIds.length > 0,
    initialSignature,
    getDelayMs: () => pollMs,
    fetchSnapshot: async () => {
      const res = await fetch("/api/viewer/docs/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ docIds: stableDocIds }),
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminDocumentStatusResponse | null;
      if (!res.ok || !payload || payload.ok !== true) return null;
      return payload;
    },
    getSignature: (payload) =>
      payload.collection_signature || getDocumentCollectionSignature(payload.docs),
    evaluate: (payload, ctx) =>
      onSnapshot(payload, ctx) ?? {
        shouldContinue: payload.has_active_docs,
      },
  });
}
