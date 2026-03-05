import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("upload complete URL guardrails", () => {
  test("upload complete route uses trusted base-url resolver for view_url", () => {
    const code = readFileSync("src/app/api/admin/upload/complete/route.ts", "utf8");
    expect(code.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(code.includes("parseJsonBodyLength(")).toBeTruthy();
    expect(code.includes('error: "PAYLOAD_TOO_LARGE"')).toBeTruthy();
    expect(code.includes("http://localhost:3000")).toBeFalsy();
  });

  test("upload complete route avoids logging raw usage increment errors", () => {
    const code = readFileSync("src/app/api/admin/upload/complete/route.ts", "utf8");
    expect(code.includes("console.warn(\"Failed to increment upload usage.\")")).toBeTruthy();
    expect(code.includes("console.warn(\"Failed to increment upload usage:\", e)")).toBeFalsy();
  });
});
