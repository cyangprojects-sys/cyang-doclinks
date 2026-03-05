export type DocState = "UPLOADING" | "PROCESSING" | "READY" | "ERROR" | "DELETED";
export type ScanState =
  | "NOT_SCHEDULED"
  | "PENDING"
  | "RUNNING"
  | "CLEAN"
  | "NEEDS_REVIEW"
  | "MALICIOUS"
  | "SKIPPED";
export type SharePolicyState = "SHARE_ALLOWED" | "SHARE_ALLOWED_WITH_WARNING" | "SHARE_BLOCKED" | "SHARE_LIMITED";
export type StatusTone = "positive" | "warning" | "danger" | "neutral";

export const SCAN_PENDING_SHARE_WARNING =
  "Security scan is still running. You can share now, and we'll automatically restrict access if it's flagged.";

const MAX_STATE_INPUT_LEN = 64;
const MAX_UPLOAD_ERROR_LEN = 180;

function norm(v: string | null | undefined): string {
  const raw = String(v || "").trim().toLowerCase();
  if (!raw || raw.length > MAX_STATE_INPUT_LEN || /[\r\n\0]/.test(raw)) return "";
  return raw;
}

export function normalizeDocState(raw: string | null | undefined): DocState {
  const v = norm(raw);
  if (v === "uploading" || v === "queued") return "UPLOADING";
  if (v === "processing" || v === "encrypting" || v === "securing" || v === "staging") return "PROCESSING";
  if (v === "error" || v === "failed" || v === "failure") return "ERROR";
  if (v === "deleted") return "DELETED";
  return "READY";
}

export function normalizeScanState(
  scanRaw: string | null | undefined,
  moderationRaw?: string | null | undefined
): ScanState {
  const moderation = norm(moderationRaw);
  if (moderation === "quarantined" || moderation === "disabled" || moderation === "deleted") {
    return "MALICIOUS";
  }

  const scan = norm(scanRaw);
  if (scan === "pending" || scan === "queued") return "PENDING";
  if (scan === "running") return "RUNNING";
  if (scan === "clean") return "CLEAN";
  if (scan === "skipped") return "SKIPPED";
  if (scan === "infected" || scan === "malicious" || scan === "quarantined" || scan === "blocked") return "MALICIOUS";
  if (
    scan === "error" ||
    scan === "failed" ||
    scan === "failure" ||
    scan === "dead_letter" ||
    scan === "needs_review" ||
    scan === "review" ||
    scan === "unknown" ||
    scan === "inconclusive"
  ) {
    return "NEEDS_REVIEW";
  }
  if (scan === "not_scheduled" || scan === "unscanned" || !scan) return "NOT_SCHEDULED";
  return "NEEDS_REVIEW";
}

export function deriveSharePolicyState(args: {
  docStateRaw?: string | null;
  scanStateRaw?: string | null;
  moderationStatusRaw?: string | null;
  allowNeedsReview?: boolean;
}): SharePolicyState {
  const docState = normalizeDocState(args.docStateRaw);
  const scanState = normalizeScanState(args.scanStateRaw, args.moderationStatusRaw);
  const allowNeedsReview = Boolean(args.allowNeedsReview);

  if (docState === "UPLOADING" || docState === "PROCESSING" || docState === "ERROR" || docState === "DELETED") {
    return "SHARE_BLOCKED";
  }
  if (scanState === "MALICIOUS") return "SHARE_BLOCKED";
  if (scanState === "NEEDS_REVIEW") return allowNeedsReview ? "SHARE_ALLOWED_WITH_WARNING" : "SHARE_BLOCKED";
  if (scanState === "CLEAN") return "SHARE_ALLOWED";
  if (scanState === "PENDING" || scanState === "RUNNING" || scanState === "NOT_SCHEDULED" || scanState === "SKIPPED") {
    return "SHARE_ALLOWED_WITH_WARNING";
  }
  return "SHARE_BLOCKED";
}

export function getShareEligibility(args: {
  docStateRaw?: string | null;
  scanStateRaw?: string | null;
  moderationStatusRaw?: string | null;
  allowNeedsReview?: boolean;
}): {
  canCreateLink: boolean;
  sharePolicyState: SharePolicyState;
  warning: string | null;
  blockedReason: string | null;
} {
  const docState = normalizeDocState(args.docStateRaw);
  const scanState = normalizeScanState(args.scanStateRaw, args.moderationStatusRaw);
  const sharePolicyState = deriveSharePolicyState(args);

  if (sharePolicyState === "SHARE_ALLOWED") {
    return { canCreateLink: true, sharePolicyState, warning: null, blockedReason: null };
  }
  if (sharePolicyState === "SHARE_ALLOWED_WITH_WARNING") {
    return {
      canCreateLink: true,
      sharePolicyState,
      warning: SCAN_PENDING_SHARE_WARNING,
      blockedReason: null,
    };
  }

  if (docState === "UPLOADING" || docState === "PROCESSING") {
    return { canCreateLink: false, sharePolicyState, warning: null, blockedReason: "This file is still uploading or processing." };
  }
  if (docState === "ERROR") {
    return { canCreateLink: false, sharePolicyState, warning: null, blockedReason: "Upload failed. Try again." };
  }
  if (scanState === "MALICIOUS") {
    return { canCreateLink: false, sharePolicyState, warning: null, blockedReason: "File failed security checks." };
  }
  if (scanState === "NEEDS_REVIEW") {
    return { canCreateLink: false, sharePolicyState, warning: null, blockedReason: "This file needs review before sharing." };
  }
  return { canCreateLink: false, sharePolicyState, warning: null, blockedReason: "Sharing is blocked by policy." };
}

export function getDocumentUiStatus(args: {
  docStateRaw?: string | null;
  scanStateRaw?: string | null;
  moderationStatusRaw?: string | null;
}): { label: string; subtext: string; tone: StatusTone; tooltip: string } {
  const docState = normalizeDocState(args.docStateRaw);
  const scanState = normalizeScanState(args.scanStateRaw, args.moderationStatusRaw);
  const policy = deriveSharePolicyState(args);

  if (docState === "ERROR") {
    return {
      label: "Upload failed",
      subtext: "Try again",
      tone: "danger",
      tooltip: `doc_state=${docState} • scan_state=${scanState} • share_policy_state=${policy}`,
    };
  }
  if (scanState === "MALICIOUS") {
    return {
      label: "Blocked",
      subtext: "File failed security checks",
      tone: "danger",
      tooltip: `doc_state=${docState} • scan_state=${scanState} • share_policy_state=${policy}`,
    };
  }
  if (scanState === "NEEDS_REVIEW") {
    return {
      label: "Needs review",
      subtext: "Sharing may be limited",
      tone: "warning",
      tooltip: `doc_state=${docState} • scan_state=${scanState} • share_policy_state=${policy}`,
    };
  }
  if (docState === "UPLOADING") {
    return {
      label: "Uploading...",
      subtext: "Upload in progress",
      tone: "neutral",
      tooltip: `doc_state=${docState} • scan_state=${scanState} • share_policy_state=${policy}`,
    };
  }
  if (docState === "PROCESSING") {
    return {
      label: "Securing...",
      subtext: "Encrypting and preparing",
      tone: "neutral",
      tooltip: `doc_state=${docState} • scan_state=${scanState} • share_policy_state=${policy}`,
    };
  }
  if (scanState === "CLEAN") {
    return {
      label: "Ready",
      subtext: "Scan complete",
      tone: "positive",
      tooltip: `doc_state=${docState} • scan_state=${scanState} • share_policy_state=${policy}`,
    };
  }
  return {
    label: "Ready to share",
    subtext: "Security scan running in background",
    tone: "positive",
    tooltip: `doc_state=${docState} • scan_state=${scanState} • share_policy_state=${policy}`,
  };
}

export function getUploadUiStatus(args: {
  uploadStatus: "queued" | "uploading" | "processing" | "done" | "error";
  docStateRaw?: string | null;
  scanStateRaw?: string | null;
  moderationStatusRaw?: string | null;
  errorMessage?: string | null;
}): { label: string; subtext: string; tone: StatusTone } {
  if (args.uploadStatus === "error") {
    const errorText = String(args.errorMessage || "").trim();
    const safeError =
      errorText && errorText.length <= MAX_UPLOAD_ERROR_LEN && !/[\r\n\0]/.test(errorText) ? errorText : "Try again";
    return { label: "Upload failed", subtext: safeError, tone: "danger" };
  }
  if (args.uploadStatus === "queued") {
    return { label: "Queued", subtext: "Waiting to upload", tone: "neutral" };
  }
  if (args.uploadStatus === "uploading") {
    return { label: "Uploading...", subtext: "Sending file", tone: "neutral" };
  }
  if (args.uploadStatus === "processing") {
    return { label: "Securing...", subtext: "Encrypting and preparing", tone: "neutral" };
  }

  const docUi = getDocumentUiStatus({
    docStateRaw: args.docStateRaw,
    scanStateRaw: args.scanStateRaw,
    moderationStatusRaw: args.moderationStatusRaw,
  });
  return { label: docUi.label, subtext: docUi.subtext, tone: docUi.tone };
}
