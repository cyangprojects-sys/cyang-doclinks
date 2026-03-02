import { expect, test } from "@playwright/test";
import { constantTimeEqual, generateApiKey, hashApiKey } from "../src/lib/apiKeys";

const ENV_KEYS = ["API_KEY_SALT", "NEXTAUTH_SECRET", "VIEW_SALT"] as const;
type Snapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function takeSnapshot(): Snapshot {
  return {
    API_KEY_SALT: process.env.API_KEY_SALT,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    VIEW_SALT: process.env.VIEW_SALT,
  };
}

function restoreSnapshot(s: Snapshot) {
  for (const k of ENV_KEYS) {
    const v = s[k];
    if (typeof v === "undefined") delete process.env[k];
    else process.env[k] = v;
  }
}

test.describe("api key helpers", () => {
  let snapshot: Snapshot;

  test.beforeEach(() => {
    snapshot = takeSnapshot();
  });

  test.afterEach(() => {
    restoreSnapshot(snapshot);
  });

  test("generates API key with expected format and prefix", () => {
    const out = generateApiKey();
    expect(out.plaintext).toMatch(/^cyk_[a-f0-9]{8}_[A-Za-z0-9_-]+$/);
    expect(out.prefix).toMatch(/^cyk_[a-f0-9]{8}$/);
    expect(out.plaintext.startsWith(`${out.prefix}_`)).toBeTruthy();
  });

  test("hashes deterministically with API_KEY_SALT", () => {
    process.env.API_KEY_SALT = "api-key-salt";
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.VIEW_SALT;

    const a = hashApiKey("cyk_deadbeef_secret");
    const b = hashApiKey("cyk_deadbeef_secret");
    const c = hashApiKey("cyk_deadbeef_other");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });

  test("falls back from API_KEY_SALT to NEXTAUTH_SECRET then VIEW_SALT", () => {
    delete process.env.API_KEY_SALT;
    process.env.NEXTAUTH_SECRET = "nextauth-fallback";
    delete process.env.VIEW_SALT;

    const nextAuthHash = hashApiKey("cyk_deadbeef_secret");

    delete process.env.NEXTAUTH_SECRET;
    process.env.VIEW_SALT = "view-fallback";

    const viewHash = hashApiKey("cyk_deadbeef_secret");
    expect(nextAuthHash).not.toBe(viewHash);
  });

  test("throws when no salt sources are available", () => {
    delete process.env.API_KEY_SALT;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.VIEW_SALT;
    expect(() => hashApiKey("cyk_deadbeef_secret")).toThrow();
  });

  test("constantTimeEqual handles equal, unequal, and length mismatch values", () => {
    expect(constantTimeEqual("abcd", "abcd")).toBeTruthy();
    expect(constantTimeEqual("abcd", "abce")).toBeFalsy();
    expect(constantTimeEqual("abcd", "abc")).toBeFalsy();
  });
});
