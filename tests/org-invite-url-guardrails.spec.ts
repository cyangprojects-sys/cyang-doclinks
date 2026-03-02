import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("org invite URL guardrails", () => {
  test("org invite route uses trusted base url resolver", () => {
    const code = readFileSync("src/app/api/admin/security/org-access/route.ts", "utf8");
    expect(code.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(code.includes("http://localhost:3000")).toBeFalsy();
  });
});
