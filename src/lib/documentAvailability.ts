import { getDocumentUiStatus, getShareEligibility, normalizeScanState } from "@/lib/documentStatus";

export type DocumentAvailabilityRecord = {
  encryption_enabled: boolean;
  moderation_status: string;
  scan_status: string;
  status: string;
  r2_key: string | null;
  org_disabled?: boolean;
  org_active?: boolean;
};

export type DocumentAvailabilitySnapshot = {
  hint: string | null;
  shouldAutoRefresh: boolean;
  statusSignature: string;
};

export function evaluateDocumentAvailability(
  record: DocumentAvailabilityRecord | null | undefined,
  opts?: { allowUnencryptedServing?: boolean }
): DocumentAvailabilitySnapshot {
  const r = record;
  if (!r) {
    return {
      hint: null,
      shouldAutoRefresh: false,
      statusSignature: "missing",
    };
  }

  const signatureParts = [
    String(r.status || "ready").trim().toLowerCase() || "ready",
    String(r.scan_status || "unscanned").trim().toLowerCase() || "unscanned",
    String(r.moderation_status || "active").trim().toLowerCase() || "active",
    r.encryption_enabled ? "enc" : "plain",
    r.r2_key ? "has-r2" : "missing-r2",
    r.org_disabled === true ? "org-disabled" : "org-enabled",
    r.org_active === false ? "org-inactive" : "org-active",
  ];
  const statusSignature = signatureParts.join(":");

  if ((r.status || "").toLowerCase() === "deleted") {
    return { hint: "This document is deleted and unavailable.", shouldAutoRefresh: false, statusSignature };
  }
  if (r.org_disabled === true || r.org_active === false) {
    return { hint: "This organization is disabled, so document serving is unavailable.", shouldAutoRefresh: false, statusSignature };
  }
  if (!r.r2_key) {
    return { hint: "Document storage pointer is missing. Re-upload this document.", shouldAutoRefresh: false, statusSignature };
  }

  if (!r.encryption_enabled && !opts?.allowUnencryptedServing) {
    return {
      hint: "This is a legacy unencrypted upload. Serving is blocked by policy. Re-upload or migrate this document to encrypted storage.",
      shouldAutoRefresh: false,
      statusSignature,
    };
  }

  const moderation = String(r.moderation_status || "active").toLowerCase();
  const scanRaw = String(r.scan_status || "unscanned").toLowerCase();
  if (moderation === "quarantined") {
    const rescanInProgress =
      scanRaw === "pending" ||
      scanRaw === "queued" ||
      scanRaw === "running" ||
      scanRaw === "unscanned" ||
      scanRaw === "not_scheduled";
    if (rescanInProgress) {
      return {
        hint: "Security rescan in progress. Available after scan completes.",
        shouldAutoRefresh: true,
        statusSignature,
      };
    }
    return { hint: "This document is quarantined and cannot be served.", shouldAutoRefresh: false, statusSignature };
  }
  if (moderation === "disabled" || moderation === "deleted") {
    return { hint: `This document is ${moderation} and unavailable.`, shouldAutoRefresh: false, statusSignature };
  }

  const eligibility = getShareEligibility({
    docStateRaw: r.status || "ready",
    scanStateRaw: r.scan_status || "unscanned",
    moderationStatusRaw: r.moderation_status || "active",
  });
  if (!eligibility.canCreateLink) {
    return {
      hint: eligibility.blockedReason || "This document cannot be shared right now.",
      shouldAutoRefresh: false,
      statusSignature,
    };
  }

  const scanState = normalizeScanState(r.scan_status || "unscanned", r.moderation_status || "active");
  const shouldAutoRefresh = scanState === "PENDING" || scanState === "RUNNING" || scanState === "NOT_SCHEDULED";

  if (eligibility.warning) {
    const ui = getDocumentUiStatus({
      docStateRaw: r.status || "ready",
      scanStateRaw: r.scan_status || "unscanned",
      moderationStatusRaw: r.moderation_status || "active",
    });
    return {
      hint: `${ui.label}: ${ui.subtext}.`,
      shouldAutoRefresh,
      statusSignature,
    };
  }

  return { hint: null, shouldAutoRefresh: false, statusSignature };
}
