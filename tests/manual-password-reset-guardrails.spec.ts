import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("manual password reset guardrails", () => {
  test("request and complete routes enforce throttling, payload bounds, and shared helpers", () => {
    const requestCode = readFileSync("src/app/api/auth/manual-password-reset/request/route.ts", "utf8");
    const completeCode = readFileSync("src/app/api/auth/manual-password-reset/complete/route.ts", "utf8");

    expect(requestCode.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(requestCode.includes("MAX_RESET_REQUEST_BODY_BYTES")).toBeTruthy();
    expect(requestCode.includes("issueManualPasswordReset(")).toBeTruthy();
    expect(requestCode.includes("sendManualPasswordResetEmail(")).toBeTruthy();
    expect(requestCode.includes("signup_activation.sql")).toBeFalsy();

    expect(completeCode.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(completeCode.includes("MAX_RESET_COMPLETE_BODY_BYTES")).toBeTruthy();
    expect(completeCode.includes("resetManualPassword(")).toBeTruthy();
    expect(completeCode.includes('error: "INVALID_RESET_TOKEN"')).toBeTruthy();
    expect(completeCode.includes("activation_token_hash")).toBeFalsy();
  });
});
