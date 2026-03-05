import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin debug log guardrails", () => {
  test("admin debug route redacts server-side errors", () => {
    const code = readFileSync("src/app/api/admin/debug/route.ts", "utf8");
    expect(code.includes("console.error(\"ADMIN DEBUG ERROR:\", err)")).toBeFalsy();
    expect(code.includes("console.warn(\"ADMIN DEBUG ERROR\")")).toBeTruthy();
    expect(code.includes("Debug inspection failed:")).toBeFalsy();
    expect(code.includes("message: \"Debug inspection failed.\"")).toBeTruthy();
    expect(code.includes('error: "UNAUTHENTICATED"')).toBeTruthy();
    expect(code.includes('error: "FORBIDDEN"')).toBeTruthy();
  });
});
