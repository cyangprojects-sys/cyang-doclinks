import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("manual signup URL guardrails", () => {
  test("manual signup activation link uses trusted base-url resolver", () => {
    const code = readFileSync("src/app/api/auth/manual-signup/route.ts", "utf8");
    expect(code.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(code.includes("new URL(req.url).origin")).toBeFalsy();
  });
});
