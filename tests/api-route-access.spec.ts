import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api route access controls (static)", () => {
  test("health endpoints remain publicly readable but throttled", () => {
    for (const file of [
      "src/app/api/health/route.ts",
      "src/app/api/health/live/route.ts",
      "src/app/api/health/ready/route.ts",
      "src/app/api/health/deps/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("export async function GET")).toBeTruthy();
      expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
      expect(code.includes("RATE_LIMIT_HEALTH_IP_PER_MIN")).toBeTruthy();
    }
  });

  test("repo no longer includes stray public debug alias endpoint", () => {
    expect(() => readFileSync("src/app/api/debug/alias/[alias]/route.ts", "utf8")).toThrow();
  });

  test("admin dbinfo endpoint enforces owner auth with explicit auth errors", () => {
    const code = readFileSync("src/app/api/admin/dbinfo/route.ts", "utf8");
    expect(code.includes("isDebugApiEnabled()")).toBeTruthy();
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes('await requireRole("owner")')).toBeTruthy();
    expect(code.includes("UNAUTHENTICATED")).toBeTruthy();
    expect(code.includes("FORBIDDEN")).toBeTruthy();
  });
});
