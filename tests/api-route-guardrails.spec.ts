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

  test("debug alias lookup route requires owner role and debug gate", () => {
    const code = src("src/app/api/debug/alias/[alias]/route.ts");
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_DEBUG_ALIAS_LOOKUP_PER_MIN")).toBeTruthy();
    expect(code.includes('await requireRole("owner")')).toBeTruthy();
    expect(code.includes("isDebugApiEnabled()")).toBeTruthy();
    expect(code.includes("UNAUTHENTICATED")).toBeTruthy();
    expect(code.includes("FORBIDDEN")).toBeTruthy();
  });

  test("admin analytics aggregate route is rate-limited", () => {
    const code = src("src/app/api/admin/analytics/aggregate/route.ts");
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_ADMIN_ANALYTICS_AGGREGATE_PER_MIN")).toBeTruthy();
    expect(code.includes('requireRole("admin")')).toBeTruthy();
  });

  test("sensitive admin GET routes include explicit rate limiting", () => {
    const routes = [
      "src/app/api/admin/audit/export/route.ts",
      "src/app/api/admin/billing/invoices/route.ts",
      "src/app/api/admin/billing/status/route.ts",
      "src/app/api/admin/db-index-audit/route.ts",
      "src/app/api/admin/dbinfo/route.ts",
      "src/app/api/admin/debug/route.ts",
      "src/app/api/admin/retention/run/route.ts",
      "src/app/api/admin/security/keys/route.ts",
      "src/app/api/admin/upload/route.ts",
    ];
    for (const route of routes) {
      const code = src(route);
      expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
      expect(code.includes("strict: true")).toBeTruthy();
    }
  });

  test("cron unauthorized responses do not include setup hints", () => {
    const files = routeFiles().filter((f) => f.includes("src/app/api/cron/"));
    const findings: string[] = [];
    for (const f of files) {
      const code = src(f);
      if (code.includes('error: "UNAUTHORIZED"') && code.includes("hint")) {
        findings.push(f);
      }
    }
    expect(findings).toEqual([]);
  });

  test("viewer office preview fetch stays scoped to raw document paths", () => {
    const code = src("src/app/api/viewer/office/route.ts");
    expect(code.includes("isAllowedRawPath")).toBeTruthy();
    expect(/\/\^\\\/s\\\/\[\^\/\]\+\\\/raw\$\/i/.test(code)).toBeTruthy();
    expect(/\/\^\\\/d\\\/\[\^\/\]\+\\\/raw\$\/i/.test(code)).toBeTruthy();
    expect(code.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(code.includes("req.nextUrl.origin")).toBeFalsy();
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

  test("database metadata/debug queries require admin auth", () => {
    const files = routeFiles();
    const findings: string[] = [];
    const debugTokens = ["current_database()", "pg_catalog", "information_schema", "to_regclass("];

    for (const f of files) {
      const code = src(f);
      if (!debugTokens.some((t) => code.includes(t))) continue;
      const adminGuarded =
        code.includes('requireRole("admin")') ||
        code.includes('requireRole("owner")') ||
        code.includes('requirePermission("security.keys.read")') ||
        code.includes("requireOwner(") ||
        code.includes("requireOwnerAdmin(");
      if (!adminGuarded) findings.push(f);
    }

    expect(findings).toEqual([]);
  });

  test("api redirects avoid request-host-derived absolute URLs", () => {
    const files = routeFiles();
    const findings: string[] = [];

    for (const f of files) {
      const code = src(f);
      if (code.includes("NextResponse.redirect(new URL(") && code.includes(", req.url)")) {
        findings.push(f);
      }
    }

    expect(findings).toEqual([]);
  });
});
