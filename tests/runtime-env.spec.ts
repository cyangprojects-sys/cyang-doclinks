import { expect, test } from "@playwright/test";
import { assertRuntimeEnv, isRuntimeEnvError, RuntimeEnvError } from "../src/lib/runtimeEnv";

const ENV_KEYS = [
  "NODE_ENV",
  "ENABLE_STRICT_ENV_VALIDATION",
  "DATABASE_URL",
  "VIEW_SALT",
  "NEXTAUTH_SECRET",
  "DOC_MASTER_KEYS",
  "R2_BUCKET",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "UPLOAD_ABSOLUTE_MAX_BYTES",
  "PDF_MAX_PAGES",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRO_PRICE_IDS",
] as const;

type Snapshot = Record<string, string | undefined>;

function takeSnapshot(): Snapshot {
  const out: Snapshot = {};
  for (const k of ENV_KEYS) out[k] = process.env[k];
  return out;
}

function restoreSnapshot(s: Snapshot) {
  for (const k of ENV_KEYS) {
    const v = s[k];
    if (typeof v === "undefined") delete process.env[k];
    else process.env[k] = v;
  }
}

test.describe("runtime env validation", () => {
  let snapshot: Snapshot;

  test.beforeEach(() => {
    snapshot = takeSnapshot();
  });

  test.afterEach(() => {
    restoreSnapshot(snapshot);
  });

  test("does nothing when strict validation is disabled", () => {
    delete process.env.NODE_ENV;
    delete process.env.ENABLE_STRICT_ENV_VALIDATION;
    delete process.env.DATABASE_URL;
    expect(() => assertRuntimeEnv("serve")).not.toThrow();
  });

  test("throws RuntimeEnvError with missing keys when strict mode is enabled", () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_STRICT_ENV_VALIDATION = "1";
    delete process.env.DATABASE_URL;
    delete process.env.VIEW_SALT;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.DOC_MASTER_KEYS;

    let caught: unknown = null;
    try {
      assertRuntimeEnv("serve");
    } catch (e: unknown) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(RuntimeEnvError);
    expect(isRuntimeEnvError(caught)).toBeTruthy();
    if (caught instanceof RuntimeEnvError) {
      expect(caught.scope).toBe("serve");
      expect(caught.missing).toContain("DATABASE_URL");
      expect(caught.missing).toContain("DOC_MASTER_KEYS");
      expect(caught.missing).toContain("VIEW_SALT|NEXTAUTH_SECRET");
    }
  });

  test("passes when required vars for stripe_webhook are set", () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_STRICT_ENV_VALIDATION = "true";
    process.env.DATABASE_URL = "postgres://test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_PRO_PRICE_IDS = "price_test";
    expect(() => assertRuntimeEnv("stripe_webhook")).not.toThrow();
  });
});
