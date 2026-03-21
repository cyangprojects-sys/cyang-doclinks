"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminDocumentStatusPolling } from "@/hooks/useAdminDocumentStatusPolling";
import {
  getActiveDocumentIds,
  getDocumentCollectionSignature,
  reconcileDocumentStatusRows,
  toDocumentStatusSnapshot,
  type DocumentStatusSnapshot,
} from "@/lib/documentTransientState";
import UploadPanel, { type UploadedDocumentRecord } from "./UploadPanel";
import UnifiedDocsTableClient, { type UnifiedDocRow } from "./UnifiedDocsTableClient";

const DOCUMENT_STATUS_POLL_MS = 45_000;

function mergeUploadedRows(currentRows: UnifiedDocRow[], createdDocs: UploadedDocumentRecord[]): UnifiedDocRow[] {
  const byDocId = new Map(currentRows.map((row) => [row.doc_id, row]));
  for (const created of createdDocs) {
    byDocId.set(created.doc_id, created);
  }

  return Array.from(byDocId.values()).sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

export default function DocumentsWorkspaceClient({
  initialRows,
  defaultPageSize = 25,
  showDelete,
  shareBaseUrl,
  canCheckEncryptionStatus,
  autoOpenPicker = false,
  fromCreateLink = false,
  basePath = "/admin",
}: {
  initialRows: UnifiedDocRow[];
  defaultPageSize?: number;
  showDelete: boolean;
  shareBaseUrl?: string;
  canCheckEncryptionStatus: boolean;
  autoOpenPicker?: boolean;
  fromCreateLink?: boolean;
  basePath?: string;
}) {
  const [rows, setRows] = useState<UnifiedDocRow[]>(initialRows);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const rowStatusSnapshots = useMemo(
    () =>
      rows.map((row) =>
        toDocumentStatusSnapshot({
          doc_id: row.doc_id,
          doc_state: row.doc_state,
          scan_state: row.scan_status,
          moderation_status: row.moderation_status,
        })
      ),
    [rows]
  );
  const rowStatusMap = useMemo(
    () => new Map<string, DocumentStatusSnapshot>(rowStatusSnapshots.map((snapshot) => [snapshot.doc_id, snapshot])),
    [rowStatusSnapshots]
  );
  const pendingDocIds = useMemo(() => getActiveDocumentIds(rows), [rows]);
  const pendingSignature = useMemo(
    () =>
      getDocumentCollectionSignature(
        rowStatusSnapshots.filter((snapshot) => pendingDocIds.includes(snapshot.doc_id))
      ),
    [pendingDocIds, rowStatusSnapshots]
  );

  useAdminDocumentStatusPolling({
    docIds: pendingDocIds,
    pollMs: DOCUMENT_STATUS_POLL_MS,
    initialSignature: pendingSignature || null,
    onSnapshot: (payload) => {
      setRows((prev) =>
        reconcileDocumentStatusRows(prev, payload.docs, {
          removeDocIds: payload.missing_doc_ids,
        }).rows
      );
      return {
        shouldContinue: payload.has_active_docs,
      };
    },
  });

  return (
    <>
      <section className="surface-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Step 1</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Upload file</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Start here. When a file is clean, the library below will guide you to create its protected link.
            </p>
          </div>
          {fromCreateLink ? (
            <div className="rounded-sm border border-[var(--border-accent)] bg-[var(--surface-selected)] px-4 py-3 text-sm text-[var(--accent-primary)]">
              Upload a file first, then create its protected link from the file list.
            </div>
          ) : null}
        </div>
        <UploadPanel
          canCheckEncryptionStatus={canCheckEncryptionStatus}
          autoOpenPicker={autoOpenPicker}
          onDocumentsCreated={(createdDocs) => {
            setRows((prev) => mergeUploadedRows(prev, createdDocs));
          }}
          externalStatusSnapshots={rowStatusMap}
        />
      </section>

      <UnifiedDocsTableClient
        rows={rows}
        defaultPageSize={defaultPageSize}
        showDelete={showDelete}
        layout="full"
        shareBaseUrl={shareBaseUrl}
        basePath={basePath}
        onDocDeleted={(docId) => {
          setRows((prev) => prev.filter((row) => row.doc_id !== docId));
        }}
        onDocsDeleted={(docIds) => {
          const removed = new Set(docIds);
          setRows((prev) => prev.filter((row) => !removed.has(row.doc_id)));
        }}
      />
    </>
  );
}
