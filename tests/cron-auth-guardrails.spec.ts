import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("cron auth guardrails", () => {
  test("cron unauthorized response is cloaked by default", async () => {
    const code = readFileSync("src/lib/cronAuth.ts", "utf8");
    expect(code.includes("CRON_HIDE_UNAUTHORIZED")).toBeTruthy();
    expect(code.includes("error: \"NOT_FOUND\"")).toBeTruthy();
  });

  test("all cron routes use shared unauthorized response helper", async () => {
    const routes = [
      "src/app/api/cron/aggregate/route.ts",
      "src/app/api/cron/billing-sync/route.ts",
      "src/app/api/cron/key-rotation/route.ts",
      "src/app/api/cron/nightly/route.ts",
      "src/app/api/cron/orphan-sweep/route.ts",
      "src/app/api/cron/retention/route.ts",
      "src/app/api/cron/scan/route.ts",
      "src/app/api/cron/webhooks/route.ts",
    ];
    for (const route of routes) {
      const code = readFileSync(route, "utf8");
      expect(code.includes("cronUnauthorizedResponse")).toBeTruthy();
      expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
      expect(code.includes("RATE_LIMIT")).toBeTruthy();
    }
  });
});
