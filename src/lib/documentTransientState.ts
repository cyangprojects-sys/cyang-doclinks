import { normalizeDocState, normalizeScanState } from "@/lib/documentStatus";

type NullableString = string | null | undefined;

export type DocumentStatusSource = {
  doc_state?: NullableString;
  scan_status?: NullableString;
  moderation_status?: NullableString;
  docState?: NullableString;
  scanState?: NullableString;
  moderationStatus?: NullableString;
};

export type DocumentStatusSnapshot = {
  doc_id: string;
  doc_state: string;
  scan_state: string;
  moderation_status: string;
  status_signature: string;
  is_active: boolean;
  is_terminal: boolean;
};

export type DocumentStatusCollection<TSnapshot = DocumentStatusSnapshot> = {
  docs: TSnapshot[];
  collection_signature: string;
  has_active_docs: boolean;
};

export type DocumentStatusCarrier = {
  doc_id: string;
  doc_state: string | null;
  scan_status: string | null;
  moderation_status: string | null;
};

function normalizeModerationStatus(value: NullableString): string {
  const normalized = String(value || "active").trim().toLowerCase();
  return normalized || "active";
}

export function getDocumentStatusFields(source: DocumentStatusSource) {
  const docStateRaw = source.doc_state ?? source.docState ?? null;
  const scanStateRaw = source.scan_status ?? source.scanState ?? null;
  const moderationStatusRaw = source.moderation_status ?? source.moderationStatus ?? null;

  return {
    doc_state: normalizeDocState(docStateRaw),
    scan_state: normalizeScanState(scanStateRaw, moderationStatusRaw),
    moderation_status: normalizeModerationStatus(moderationStatusRaw),
  };
}

export function getDocumentStatusSignature(source: DocumentStatusSource): string {
  const status = getDocumentStatusFields(source);
  return [status.doc_state, status.scan_state, status.moderation_status].join(":");
}

export function isDocumentStatusActive(source: DocumentStatusSource): boolean {
  const status = getDocumentStatusFields(source);
  if (status.doc_state === "UPLOADING" || status.doc_state === "PROCESSING") return true;
  return status.scan_state === "PENDING" || status.scan_state === "RUNNING" || status.scan_state === "NOT_SCHEDULED";
}

export function toDocumentStatusSnapshot(input: {
  doc_id: string;
  doc_state: NullableString;
  scan_state: NullableString;
  moderation_status: NullableString;
}): DocumentStatusSnapshot {
  const status = getDocumentStatusFields(input);
  const status_signature = getDocumentStatusSignature(input);
  const is_active = isDocumentStatusActive(input);

  return {
    doc_id: String(input.doc_id || "").trim(),
    doc_state: status.doc_state,
    scan_state: status.scan_state,
    moderation_status: status.moderation_status,
    status_signature,
    is_active,
    is_terminal: !is_active,
  };
}

export function getDocumentCollectionSignature(
  docs: Array<Pick<DocumentStatusSnapshot, "doc_id" | "status_signature">>
): string {
  return docs
    .map((doc) => `${String(doc.doc_id || "").trim()}:${String(doc.status_signature || "").trim()}`)
    .sort()
    .join("|");
}

export function toDocumentStatusCollection(
  docs: Array<{
    doc_id: string;
    doc_state: NullableString;
    scan_state: NullableString;
    moderation_status: NullableString;
  }>
): DocumentStatusCollection {
  const snapshots = docs.map((doc) => toDocumentStatusSnapshot(doc));
  return {
    docs: snapshots,
    collection_signature: getDocumentCollectionSignature(snapshots),
    has_active_docs: snapshots.some((doc) => doc.is_active),
  };
}

export function getActiveDocumentIds(
  docs: Array<{
    doc_id: string;
  } & DocumentStatusSource>
): string[] {
  return docs
    .filter((doc) => isDocumentStatusActive(doc))
    .map((doc) => String(doc.doc_id || "").trim())
    .filter(Boolean);
}

export function reconcileDocumentStatusRows<TRow extends DocumentStatusCarrier>(
  rows: TRow[],
  snapshots: ReadonlyArray<DocumentStatusSnapshot>,
  opts?: { removeDocIds?: ReadonlyArray<string> }
): {
  rows: TRow[];
  changedDocIds: string[];
  removedDocIds: string[];
} {
  const byDocId = new Map(snapshots.map((snapshot) => [String(snapshot.doc_id || "").trim(), snapshot]));
  const removeDocIds = new Set((opts?.removeDocIds || []).map((docId) => String(docId || "").trim()).filter(Boolean));
  const changedDocIds = new Set<string>();
  const removedDocIds = new Set<string>();

  const nextRows: TRow[] = [];
  for (const row of rows) {
    const docId = String(row.doc_id || "").trim();
    if (!docId) {
      nextRows.push(row);
      continue;
    }
    if (removeDocIds.has(docId)) {
      removedDocIds.add(docId);
      continue;
    }

    const snapshot = byDocId.get(docId);
    if (!snapshot) {
      nextRows.push(row);
      continue;
    }

    if (
      String(row.doc_state || "") === snapshot.doc_state &&
      String(row.scan_status || "") === snapshot.scan_state &&
      String(row.moderation_status || "") === snapshot.moderation_status
    ) {
      nextRows.push(row);
      continue;
    }

    changedDocIds.add(docId);
    nextRows.push({
      ...row,
      doc_state: snapshot.doc_state,
      scan_status: snapshot.scan_state,
      moderation_status: snapshot.moderation_status,
    });
  }

  return {
    rows: nextRows,
    changedDocIds: Array.from(changedDocIds),
    removedDocIds: Array.from(removedDocIds),
  };
}
