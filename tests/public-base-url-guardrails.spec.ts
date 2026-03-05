import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolvePublicAppBaseUrl } from "../src/lib/publicBaseUrl";

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

test.describe("public base url guardrails", () => {
  test("uses configured https base url in production", () => {
    const out = resolvePublicAppBaseUrl(
      "https://malicious.example/path",
      env({ NODE_ENV: "production", APP_URL: "https://www.cyang.io" })
    );
    expect(out).toBe("https://www.cyang.io");
  });

  test("fails closed in production when configured base url is missing", () => {
    expect(() =>
      resolvePublicAppBaseUrl("https://any-host.example/path", env({ NODE_ENV: "production" }))
    ).toThrow("APP_BASE_URL_MISSING");
  });

  test("allows localhost http fallback only in non-production", () => {
    const out = resolvePublicAppBaseUrl(
      "http://localhost:3000/admin",
      env({ NODE_ENV: "development", APP_URL: "", NEXTAUTH_URL: "", VERCEL_URL: "" })
    );
    expect(out).toBe("http://localhost:3000");
  });

  test("falls back to localhost in non-production when req url is malformed", () => {
    const out = resolvePublicAppBaseUrl(
      "::::://bad-url",
      env({ NODE_ENV: "development", APP_URL: "", NEXTAUTH_URL: "", VERCEL_URL: "" })
    );
    expect(out).toBe("http://localhost:3000");
  });

  test("billing routes use trusted base-url resolver", () => {
    for (const file of [
      "src/app/api/billing/checkout/route.ts",
      "src/app/api/admin/billing/checkout/route.ts",
      "src/app/api/admin/billing/portal/route.ts",
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code.includes("resolvePublicAppBaseUrl(")).toBeTruthy();
    }
  });
});
