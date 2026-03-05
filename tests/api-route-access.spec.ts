import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api route access controls (static)", () => {
  test("health endpoint remains publicly readable", () => {
    const code = readFileSync("src/app/api/health/route.ts", "utf8");
    expect(code.includes("export async function GET")).toBeTruthy();
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("RATE_LIMIT_HEALTH_IP_PER_MIN")).toBeTruthy();
  });

  test("debug alias endpoint requires authenticated owner and debug gate", () => {
    const code = readFileSync("src/app/api/debug/alias/[alias]/route.ts", "utf8");
    expect(code.includes('await requireRole("owner")')).toBeTruthy();
    expect(code.includes("isDebugApiEnabled()")).toBeTruthy();
    expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
    expect(code.includes("UNAUTHENTICATED")).toBeTruthy();
    expect(code.includes("FORBIDDEN")).toBeTruthy();
    expect(code.includes("normalizeAliasParam(")).toBeTruthy();
    expect(code.includes("INVALID_ALIAS")).toBeTruthy();
  });

  test("admin dbinfo endpoint enforces owner auth with explicit auth errors", () => {
    const code = readFileSync("src/app/api/admin/dbinfo/route.ts", "utf8");
    expect(code.includes("isDebugApiEnabled()")).toBeTruthy();
    expect(code.includes('await requireRole("owner")')).toBeTruthy();
    expect(code.includes("UNAUTHENTICATED")).toBeTruthy();
    expect(code.includes("FORBIDDEN")).toBeTruthy();
  });
});
