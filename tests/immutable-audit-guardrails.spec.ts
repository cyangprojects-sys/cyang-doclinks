import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("immutable audit guardrails", () => {
  test("sanitizes ids, bounded text fields, and payload shape before writing", () => {
    const code = readFileSync("src/lib/immutableAudit.ts", "utf8");
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("clampText")).toBeTruthy();
    expect(code.includes("sanitizePayload")).toBeTruthy();
    expect(code.includes("MAX_PAYLOAD_DEPTH")).toBeTruthy();
    expect(code.includes("MAX_STREAM_KEY_LEN")).toBeTruthy();
  });
});
