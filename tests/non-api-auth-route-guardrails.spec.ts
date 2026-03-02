import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("non-api auth route guardrails", () => {
  test("/auth/email/start has throttling and input/output hardening", () => {
    const code = readFileSync("src/app/auth/email/start/route.ts", "utf8");
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_AUTH_EMAIL_START_IP_PER_MIN")).toBeTruthy();
    expect(code.includes("EMAIL_RE")).toBeTruthy();
    expect(code.includes("ALIAS_RE")).toBeTruthy();
    expect(code.includes("escHtml(")).toBeTruthy();
  });

  test("/auth/email/consume has throttling and token/alias validation", () => {
    const code = readFileSync("src/app/auth/email/consume/route.ts", "utf8");
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_AUTH_EMAIL_CONSUME_IP_PER_MIN")).toBeTruthy();
    expect(code.includes("TOKEN_RE")).toBeTruthy();
    expect(code.includes("ALIAS_RE")).toBeTruthy();
  });
});
