import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function routeFiles(): string[] {
  const raw = execSync("rg --files src/app/api | rg \"route\\.ts$\"", { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function src(file: string): string {
  return readFileSync(file, "utf8");
}

test.describe("api route guardrails", () => {
  test("admin routes are authenticated", () => {
    const files = routeFiles().filter((f) => f.includes("src/app/api/admin/"));
    const findings: string[] = [];
    const guardTokens = [
      "requireRole(",
      "requirePermission(",
      "requireOwner(",
      "requireOwnerAdmin(",
      "requireUser(",
    ];

    for (const f of files) {
      const code = src(f);
      const ok = guardTokens.some((t) => code.includes(t));
      if (!ok) findings.push(f);
    }

    expect(findings).toEqual([]);
  });

  test("cron routes enforce secret authorization", () => {
    const files = routeFiles().filter((f) => f.includes("src/app/api/cron/"));
    const findings: string[] = [];
    const allow = ["isCronAuthorized(", "function isAuthorized(", "const isAuthorized ="];

    for (const f of files) {
      const code = src(f);
      const ok = allow.some((t) => code.includes(t));
      if (!ok) findings.push(f);
    }

    expect(findings).toEqual([]);
  });

  test("public report/takedown endpoints are rate-limited", () => {
    const abuse = src("src/app/api/v1/abuse/report/route.ts");
    const takedown = src("src/app/api/v1/takedown/route.ts");
    expect(abuse.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(takedown.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
  });

  test("public unauthenticated POST endpoints include abuse throttling", () => {
    const manualSignup = src("src/app/api/auth/manual-signup/route.ts");
    const signupConsent = src("src/app/api/auth/signup-consent/route.ts");
    const officePreview = src("src/app/api/viewer/office/route.ts");
    expect(manualSignup.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(signupConsent.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(officePreview.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
  });

  test("debug alias lookup route requires admin role", () => {
    const code = src("src/app/api/debug/alias/[alias]/route.ts");
    expect(code.includes('await requireRole("admin")')).toBeTruthy();
    expect(code.includes("UNAUTHENTICATED")).toBeTruthy();
    expect(code.includes("FORBIDDEN")).toBeTruthy();
  });

  test("viewer office preview fetch stays scoped to raw document paths", () => {
    const code = src("src/app/api/viewer/office/route.ts");
    expect(code.includes("isAllowedRawPath")).toBeTruthy();
    expect(/\/\^\\\/s\\\/\[\^\/\]\+\\\/raw\$\/i/.test(code)).toBeTruthy();
    expect(/\/\^\\\/d\\\/\[\^\/\]\+\\\/raw\$\/i/.test(code)).toBeTruthy();
  });

  test("all POST routes have an explicit security control", () => {
    const files = routeFiles();
    const findings: string[] = [];
    const allowedWithoutInlineGuard = new Set<string>(["src/app/api/auth/[...nextauth]/route.ts"]);
    const guardTokens = [
      "requireRole(",
      "requireUser(",
      "requirePermission(",
      "requireOwner(",
      "requireOwnerAdmin(",
      "enforceGlobalApiRateLimit(",
      "verifyStripeWebhookSignature(",
      "verifyApiKeyFromRequest(",
      "validateApiToken(",
      "isCronAuthorized(",
      "isAuthorized(",
    ];

    for (const f of files) {
      const code = src(f);
      if (!/export\s+async\s+function\s+POST\b|export\s+function\s+POST\b/.test(code)) continue;
      if (allowedWithoutInlineGuard.has(f)) continue;
      if (!guardTokens.some((t) => code.includes(t))) {
        findings.push(f);
      }
    }

    expect(findings).toEqual([]);
  });
});
