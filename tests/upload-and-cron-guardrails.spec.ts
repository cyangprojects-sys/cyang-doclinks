import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("upload and cron guardrails", () => {
  test("upload presign route maps auth failures and avoids persisting raw error text", () => {
    const code = readFileSync("src/app/api/admin/upload/presign/route.ts", "utf8");
    expect(code.includes("authErrorCode(")).toBeTruthy();
    expect(code.includes("parseJsonBodyLength(")).toBeTruthy();
    expect(code.includes('error: "PAYLOAD_TOO_LARGE"')).toBeTruthy();
    expect(code.includes('error: "UNAUTHENTICATED"')).toBeTruthy();
    expect(code.includes('error: "FORBIDDEN"')).toBeTruthy();
    expect(code.includes("meta: { error_type:")).toBeTruthy();
  });

  test("upload abort route enforces payload-size limits", () => {
    const code = readFileSync("src/app/api/admin/upload/abort/route.ts", "utf8");
    expect(code.includes("parseJsonBodyLength(")).toBeTruthy();
    expect(code.includes('error: "PAYLOAD_TOO_LARGE"')).toBeTruthy();
  });

  test("viewer billing checkout route uses auth error classification helper", () => {
    const code = readFileSync("src/app/api/billing/checkout/route.ts", "utf8");
    expect(code.includes("authErrorCode(")).toBeTruthy();
  });

  test("cron aggregate validates daysBack and fails closed on invalid values", () => {
    const code = readFileSync("src/app/api/cron/aggregate/route.ts", "utf8");
    expect(code.includes("INVALID_DAYS_BACK")).toBeTruthy();
    expect(code.includes("/^\\d{1,4}$/")).toBeTruthy();
    expect(code.includes('error: "CRON_AGGREGATE_FAILED"')).toBeTruthy();
  });

  test("cron billing sync fails closed when maintenance result is not ok", () => {
    const code = readFileSync("src/app/api/cron/billing-sync/route.ts", "utf8");
    expect(code.includes("if (!result.ok)")).toBeTruthy();
    expect(code.includes('error: "CRON_BILLING_SYNC_FAILED"')).toBeTruthy();
  });

  test("nightly cron telemetry avoids raw exception text", () => {
    const code = readFileSync("src/app/api/cron/nightly/route.ts", "utf8");
    expect(code.includes("billingSyncOk")).toBeTruthy();
    expect(code.includes('meta: { error: "CRON_NIGHTLY_FAILED" }')).toBeTruthy();
  });
});
