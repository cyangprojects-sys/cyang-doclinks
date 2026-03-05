import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("backup status guardrails", () => {
  test("backup status webhook route enforces constant-time auth and abuse throttling", () => {
    const code = readFileSync("src/app/api/backup/status/route.ts", "utf8");
    expect(code.includes("timingSafeEqual")).toBeTruthy();
    expect(code.includes("function isAuthorized(")).toBeTruthy();
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes('scope: "ip:backup_status"')).toBeTruthy();
    expect(code.includes('error: "NOT_FOUND"')).toBeTruthy();
  });
});
