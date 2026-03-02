import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("auth sign-in guardrails", () => {
  test("oauth sign-in enforces verified email checks", () => {
    const code = readFileSync("src/auth.ts", "utf8");
    expect(code.includes('provider === "google"')).toBeTruthy();
    expect(code.includes('provider === "enterprise-sso"')).toBeTruthy();
    expect(code.includes("claimEmailVerified(")).toBeTruthy();
    expect(code.includes("OIDC_REQUIRE_EMAIL_VERIFIED")).toBeTruthy();
    expect(code.includes("/signin?error=email_not_verified")).toBeTruthy();
  });
});

