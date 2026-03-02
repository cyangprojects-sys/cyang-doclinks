import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("non-api oauth route guardrails", () => {
  test("/auth/google/start is rate-limited and validates alias format", () => {
    const code = readFileSync("src/app/auth/google/start/route.ts", "utf8");
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_AUTH_GOOGLE_START_IP_PER_MIN")).toBeTruthy();
    expect(code.includes("ALIAS_RE")).toBeTruthy();
  });

  test("/auth/google/callback is rate-limited and fails closed on oauth exchange errors", () => {
    const code = readFileSync("src/app/auth/google/callback/route.ts", "utf8");
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_AUTH_GOOGLE_CALLBACK_IP_PER_MIN")).toBeTruthy();
    expect(code.includes("ALIAS_RE")).toBeTruthy();
    expect(code.includes("try {")).toBeTruthy();
    expect(code.includes("exchangeGoogleCode")).toBeTruthy();
    expect(code.includes("catch {")).toBeTruthy();
  });

  test("/org/[slug]/auth/[provider] start route is rate-limited and validates slug", () => {
    const code = readFileSync("src/app/org/[slug]/auth/[provider]/route.ts", "utf8");
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_ORG_AUTH_START_IP_PER_MIN")).toBeTruthy();
    expect(code.includes("SLUG_RE")).toBeTruthy();
    expect(code.includes("INVITE_TOKEN_MAX")).toBeTruthy();
  });
});
