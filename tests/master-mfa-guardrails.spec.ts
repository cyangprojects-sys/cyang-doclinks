import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("master key and mfa guardrails", () => {
  test("master keys normalize key/user identifiers and clamp rotation limits", () => {
    const code = readFileSync("src/lib/masterKeys.ts", "utf8");
    expect(code.includes("normalizeKeyId")).toBeTruthy();
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("boundedInt")).toBeTruthy();
    expect(code.includes("KEY_ID_RE")).toBeTruthy();
    expect(code.includes("MAX_REASON_LEN")).toBeTruthy();
  });

  test("mfa normalizes user/email/code and bounds cookie payload parsing", () => {
    const code = readFileSync("src/lib/mfa.ts", "utf8");
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("normalizeEmail")).toBeTruthy();
    expect(code.includes("normalizeCode")).toBeTruthy();
    expect(code.includes("MAX_MFA_COOKIE_LEN")).toBeTruthy();
    expect(code.includes("MAX_RECOVERY_COOKIE_LEN")).toBeTruthy();
  });
});
