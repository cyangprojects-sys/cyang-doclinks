import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { shouldUseSecureCookies } from "../src/lib/cookies";

function toProcessEnv(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

test.describe("cookie security policy", () => {
  test("enables secure cookies in production-like environments", () => {
    expect(shouldUseSecureCookies(toProcessEnv({ APP_URL: "https://www.cyang.io" }))).toBeTruthy();
    expect(shouldUseSecureCookies(toProcessEnv({ NEXTAUTH_URL: "https://www.cyang.io" }))).toBeTruthy();
    expect(shouldUseSecureCookies(toProcessEnv({ VERCEL: "1" }))).toBeTruthy();
    expect(shouldUseSecureCookies(toProcessEnv({ VERCEL_ENV: "production" }))).toBeTruthy();
    expect(shouldUseSecureCookies(toProcessEnv({ NODE_ENV: "production" }))).toBeTruthy();
  });

  test("keeps secure cookies off by default in local non-production mode", () => {
    expect(
      shouldUseSecureCookies(toProcessEnv({
        APP_URL: "http://localhost:3000",
        NEXTAUTH_URL: "http://localhost:3000",
        NODE_ENV: "development",
      }))
    ).toBeFalsy();
  });

  test("google oauth routes use shared secure-cookie policy", () => {
    const start = readFileSync("src/app/auth/google/start/route.ts", "utf8");
    const callback = readFileSync("src/app/auth/google/callback/route.ts", "utf8");
    expect(start.includes("shouldUseSecureCookies()")).toBeTruthy();
    expect(callback.includes("shouldUseSecureCookies()")).toBeTruthy();
  });
});
