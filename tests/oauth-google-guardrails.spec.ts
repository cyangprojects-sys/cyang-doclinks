import { expect, test } from "@playwright/test";
import { googleRedirectUri } from "../src/lib/oauth-google";

const SNAP = {
  APP_URL: process.env.APP_URL,
};

test.afterEach(() => {
  if (typeof SNAP.APP_URL === "string") process.env.APP_URL = SNAP.APP_URL;
  else delete process.env.APP_URL;
});

test.describe("oauth google helper guardrails", () => {
  test("throws when APP_URL is missing", () => {
    delete process.env.APP_URL;
    expect(() => googleRedirectUri()).toThrow(/Missing APP_URL/);
  });

  test("normalizes APP_URL and avoids double slashes", () => {
    process.env.APP_URL = "https://example.com/";
    expect(googleRedirectUri()).toBe("https://example.com/auth/google/callback");
  });

  test("rejects malformed APP_URL values", () => {
    process.env.APP_URL = "javascript:alert(1)";
    expect(() => googleRedirectUri()).toThrow(/INVALID_APP_URL/);

    process.env.APP_URL = "https://user:pass@example.com";
    expect(() => googleRedirectUri()).toThrow(/INVALID_APP_URL/);
  });
});
