import { expect, test } from "@playwright/test";
import {
  deriveSharePolicyState,
  getDocumentUiStatus,
  getShareEligibility,
  getUploadUiStatus,
  normalizeDocState,
  normalizeScanState,
} from "../src/lib/documentStatus";

test.describe("document status helpers", () => {
  test("normalizes doc state aliases", () => {
    expect(normalizeDocState("queued")).toBe("UPLOADING");
    expect(normalizeDocState("encrypting")).toBe("PROCESSING");
    expect(normalizeDocState("failure")).toBe("ERROR");
    expect(normalizeDocState("deleted")).toBe("DELETED");
  });

  test("normalizes scan state with moderation overrides", () => {
    expect(normalizeScanState("clean", "quarantined")).toBe("MALICIOUS");
    expect(normalizeScanState("dead_letter")).toBe("NEEDS_REVIEW");
    expect(normalizeScanState("")).toBe("NOT_SCHEDULED");
  });

  test("derives restrictive share policy for risky states", () => {
    expect(deriveSharePolicyState({ docStateRaw: "ready", scanStateRaw: "malicious" })).toBe("SHARE_BLOCKED");
    expect(deriveSharePolicyState({ docStateRaw: "ready", scanStateRaw: "needs_review", allowNeedsReview: false })).toBe(
      "SHARE_BLOCKED"
    );
    expect(deriveSharePolicyState({ docStateRaw: "ready", scanStateRaw: "needs_review", allowNeedsReview: true })).toBe(
      "SHARE_ALLOWED_WITH_WARNING"
    );
  });

  test("blocks link creation while scans are pending or running", () => {
    const out = getShareEligibility({ docStateRaw: "ready", scanStateRaw: "running" });
    expect(out.canCreateLink).toBeFalsy();
    expect(out.warning).toBeNull();
    expect(out.blockedReason).toContain("Available after scan completes");
  });

  test("sanitizes invalid state inputs and upload errors", () => {
    expect(normalizeDocState("ready\r\nx")).toBe("READY");
    expect(normalizeScanState(`clean${"x".repeat(80)}`)).toBe("NOT_SCHEDULED");

    const upload = getUploadUiStatus({
      uploadStatus: "error",
      errorMessage: "boom\r\ninjected",
    });
    expect(upload.label).toBe("Upload failed");
    expect(upload.subtext).toBe("Try again");
  });

  test("returns stable ui status labels", () => {
    const clean = getDocumentUiStatus({ docStateRaw: "ready", scanStateRaw: "clean" });
    expect(clean.label).toBe("Ready");
    expect(clean.tone).toBe("positive");

    const blocked = getDocumentUiStatus({ docStateRaw: "ready", scanStateRaw: "malicious" });
    expect(blocked.label).toBe("Blocked");
    expect(blocked.tone).toBe("danger");
  });
});
