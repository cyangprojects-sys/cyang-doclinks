import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("admin billing redirect guardrails", () => {
  test("billing settings POST uses trusted base url resolver", () => {
    const code = readFileSync("src/app/api/admin/billing/route.ts", "utf8");
    expect(code.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(code.includes("new URL(\"/admin/billing\", base)")).toBeTruthy();
    expect(code.includes("const url = new URL(req.url)")).toBeFalsy();
  });

  test("billing form routes enforce payload-size checks", () => {
    for (const file of [
      "src/app/api/admin/billing/route.ts",
      "src/app/api/admin/billing/view-override/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("parseFormBodyLength(")).toBeTruthy();
      expect(code.includes("PAYLOAD_TOO_LARGE")).toBeTruthy();
      expect(code.includes("enforceGlobalApiRateLimit(")).toBeTruthy();
      expect(code.includes("RATE_LIMIT")).toBeTruthy();
    }
  });
});
