import { expect, test } from "@playwright/test";
import { stableHash } from "../src/lib/rateLimit";

test.describe("rate limit stableHash", () => {
  const snap = {
    VIEW_SALT: process.env.VIEW_SALT,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    DEV_ALLOW_INSECURE_FALLBACK: process.env.DEV_ALLOW_INSECURE_FALLBACK,
    NODE_ENV: process.env.NODE_ENV,
  };

  test.afterEach(() => {
    process.env.VIEW_SALT = snap.VIEW_SALT;
    process.env.NEXTAUTH_SECRET = snap.NEXTAUTH_SECRET;
    process.env.DEV_ALLOW_INSECURE_FALLBACK = snap.DEV_ALLOW_INSECURE_FALLBACK;
    process.env.NODE_ENV = snap.NODE_ENV;
  });

  test("uses configured salt and is deterministic", () => {
    process.env.VIEW_SALT = "salt-a";
    delete process.env.NEXTAUTH_SECRET;
    const a = stableHash("ip:1.2.3.4");
    const b = stableHash("ip:1.2.3.4");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  test("uses insecure fallback hash only in non-production when enabled", () => {
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = "development";
    process.env.DEV_ALLOW_INSECURE_FALLBACK = "1";
    const h = stableHash("abc");
    expect(h).toHaveLength(32);
  });

  test("throws when no secret is present and fallback disabled", () => {
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = "development";
    delete process.env.DEV_ALLOW_INSECURE_FALLBACK;
    expect(() => stableHash("abc")).toThrow("Missing hashing secret");
  });

  test("falls back to NEXTAUTH_SECRET when VIEW_SALT is missing", () => {
    delete process.env.VIEW_SALT;
    process.env.NEXTAUTH_SECRET = "nextauth-secret";
    const a = stableHash("abc");
    const b = stableHash("abc");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  test("uses explicit salt env key when provided", () => {
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    process.env.CUSTOM_HASH_SALT = "custom-salt";
    const a = stableHash("abc", "CUSTOM_HASH_SALT");
    const b = stableHash("abc", "CUSTOM_HASH_SALT");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
    delete process.env.CUSTOM_HASH_SALT;
  });

  test("does not allow insecure fallback in production", () => {
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = "production";
    process.env.DEV_ALLOW_INSECURE_FALLBACK = "1";
    expect(() => stableHash("abc")).toThrow("Missing hashing secret");
  });
});
