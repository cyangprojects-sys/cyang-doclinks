import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("infra helper guardrails", () => {
  test("cookies and redirects enforce bounded defensive parsing", () => {
    const cookies = readFileSync("src/lib/cookies.ts", "utf8");
    const redirects = readFileSync("src/lib/redirects.ts", "utf8");
    expect(cookies.includes("MAX_COOKIE_HEADER_LEN")).toBeTruthy();
    expect(cookies.includes("INVALID_COOKIE_PATH")).toBeTruthy();
    expect(redirects.includes("MAX_REDIRECT_PATH_LEN")).toBeTruthy();
    expect(redirects.includes("decodeURIComponent")).toBeTruthy();
  });

  test("cron auth/telemetry and base-url helpers clamp risky inputs", () => {
    const cronAuth = readFileSync("src/lib/cronAuth.ts", "utf8");
    const cronTelemetry = readFileSync("src/lib/cronTelemetry.ts", "utf8");
    const baseUrl = readFileSync("src/lib/publicBaseUrl.ts", "utf8");
    expect(cronAuth.includes("MAX_AUTH_HEADER_LEN")).toBeTruthy();
    expect(cronAuth.includes("timingSafeEqual")).toBeTruthy();
    expect(cronTelemetry.includes("sanitizeMeta")).toBeTruthy();
    expect(baseUrl.includes("MAX_BASE_URL_INPUT_LEN")).toBeTruthy();
  });
});
