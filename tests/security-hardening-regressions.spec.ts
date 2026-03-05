import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("security hardening regressions", () => {
  test("aliases v1 route fails closed instead of rethrowing raw errors", async () => {
    const code = readFileSync("src/app/api/v1/aliases/route.ts", "utf8");
    expect(code.includes("throw e;")).toBeFalsy();
    expect(code.includes('error: "SERVER_ERROR"')).toBeTruthy();
    expect(code.includes("alias_create_legacy_insert_failed")).toBeTruthy();
    expect(code.includes("isLegacyAliasMetadataMissing(")).toBeTruthy();
  });

  test("stripe webhook route fails closed on unhandled errors", async () => {
    const code = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
    expect(code.includes("throw e;")).toBeFalsy();
    expect(code.includes('type: "stripe_webhook_unhandled_error"')).toBeTruthy();
    expect(code.includes('error: "SERVER_ERROR"')).toBeTruthy();
  });

  test("share raw route blocks non-initial range probes", async () => {
    const code = readFileSync("src/app/s/[token]/raw/route.ts", "utf8");
    expect(code.includes("invalid_range_start")).toBeTruthy();
    expect(code.includes("Range Not Satisfiable")).toBeTruthy();
  });

  test("access ticket replay defaults to disabled", async () => {
    const code = readFileSync("src/lib/accessTicket.ts", "utf8");
    expect(code.includes('ACCESS_TICKET_REPLAY_ENABLED || "false"')).toBeTruthy();
  });

  test("encryption key metadata route requires manage permission", async () => {
    const code = readFileSync("src/app/api/admin/security/keys/route.ts", "utf8");
    expect(code.includes('requirePermission("security.keys.manage")')).toBeTruthy();
  });

  test("paid entitlement defaults to active status only", async () => {
    const code = readFileSync("src/lib/monetization.ts", "utf8");
    expect(code.includes("STRIPE_ALLOW_TRIALING_ENTITLEMENT")).toBeTruthy();
    expect(code.includes("STRIPE_ALLOW_GRACE_ENTITLEMENT")).toBeTruthy();
    expect(code.includes("= 'active'")).toBeTruthy();
  });
});
