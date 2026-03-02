import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolveConfiguredPublicAppBaseUrl } from "../src/lib/publicBaseUrl";

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

test.describe("configured base url guardrails", () => {
  test("fails closed in production when base URL config is missing", () => {
    expect(() => resolveConfiguredPublicAppBaseUrl(env({ NODE_ENV: "production" }))).toThrow("APP_BASE_URL_MISSING");
  });

  test("allows localhost fallback only outside production", () => {
    expect(resolveConfiguredPublicAppBaseUrl(env({ NODE_ENV: "development" }))).toBe("http://localhost:3000");
  });

  test("server-side link builders use configured base-url resolver", () => {
    for (const file of [
      "src/app/admin/actions.ts",
      "src/app/d/[alias]/actions.ts",
      "src/lib/expirationAlerts.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("resolveConfiguredPublicAppBaseUrl(")).toBeTruthy();
    }
  });
});
