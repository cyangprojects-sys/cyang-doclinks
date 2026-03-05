import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin billing api guardrails", () => {
  test("invoices route sanitizes Stripe invoice links and maps unauthenticated to 401", () => {
    const code = readFileSync("src/app/api/admin/billing/invoices/route.ts", "utf8");
    expect(code.includes("safeStripeRedirectUrl")).toBeTruthy();
    expect(code.includes("safeInvoiceUrl(")).toBeTruthy();
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_ADMIN_BILLING_INVOICES_PER_MIN")).toBeTruthy();
    expect(code.includes('error: "UNAUTHENTICATED"')).toBeTruthy();
    expect(code.includes('error: "FORBIDDEN"')).toBeTruthy();
  });

  test("billing status route distinguishes unauthenticated from forbidden", () => {
    const code = readFileSync("src/app/api/admin/billing/status/route.ts", "utf8");
    expect(code.includes("authErrorCode(")).toBeTruthy();
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_ADMIN_BILLING_STATUS_PER_MIN")).toBeTruthy();
    expect(code.includes('error: "UNAUTHENTICATED"')).toBeTruthy();
    expect(code.includes('error: "FORBIDDEN"')).toBeTruthy();
  });

  test("checkout, portal, and sync routes use auth error classification helper", () => {
    for (const file of [
      "src/app/api/admin/billing/checkout/route.ts",
      "src/app/api/admin/billing/portal/route.ts",
      "src/app/api/admin/billing/sync/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("authErrorCode(")).toBeTruthy();
      expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
      expect(code.includes("RATE_LIMIT")).toBeTruthy();
    }
  });

  test("billing sync logs a sanitized failure event", () => {
    const code = readFileSync("src/app/api/admin/billing/sync/route.ts", "utf8");
    expect(code.includes('type: "billing_maintenance_failed"')).toBeTruthy();
    expect(code.includes("meta: { code: safeError }")).toBeTruthy();
  });
});
