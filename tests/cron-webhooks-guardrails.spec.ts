import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("cron webhooks guardrails", () => {
  test("cron webhooks route fails closed when delivery processing returns ok=false", () => {
    const code = readFileSync("src/app/api/cron/webhooks/route.ts", "utf8");
    expect(code.includes("if (!res.ok)")).toBeTruthy();
    expect(code.includes('error: "CRON_WEBHOOKS_FAILED"')).toBeTruthy();
    expect(code.includes("processed: res.processed")).toBeTruthy();
    expect(code.includes("succeeded: res.succeeded")).toBeTruthy();
  });
});
