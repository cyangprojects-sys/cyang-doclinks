import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("api route access controls (static)", () => {
  test("health endpoint remains publicly readable", () => {
    const code = readFileSync("src/app/api/health/route.ts", "utf8");
    expect(code.includes("export async function GET")).toBeTruthy();
  });

  test("debug alias endpoint requires authenticated admin", () => {
    const code = readFileSync("src/app/api/debug/alias/[alias]/route.ts", "utf8");
    expect(code.includes('await requireRole("admin")')).toBeTruthy();
    expect(code.includes("UNAUTHENTICATED")).toBeTruthy();
    expect(code.includes("FORBIDDEN")).toBeTruthy();
  });
});
