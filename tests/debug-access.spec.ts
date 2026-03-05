import { expect, test } from "@playwright/test";
import { isDebugApiEnabled } from "../src/lib/debugAccess";

const ENV_KEYS = ["NODE_ENV", "ADMIN_DEBUG_ENABLED", "ADMIN_DEBUG_ALLOW_PROD"] as const;
type Snapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function takeSnapshot(): Snapshot {
  return {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_DEBUG_ENABLED: process.env.ADMIN_DEBUG_ENABLED,
    ADMIN_DEBUG_ALLOW_PROD: process.env.ADMIN_DEBUG_ALLOW_PROD,
  };
}

function restoreSnapshot(snapshot: Snapshot) {
  const env = process.env as Record<string, string | undefined>;
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (typeof value === "string") env[key] = value;
    else delete env[key];
  }
}

test.describe("debug access helper", () => {
  let snapshot: Snapshot;

  test.beforeEach(() => {
    snapshot = takeSnapshot();
  });

  test.afterEach(() => {
    restoreSnapshot(snapshot);
  });

  test("requires ADMIN_DEBUG_ENABLED regardless of environment", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ADMIN_DEBUG_ENABLED;
    expect(isDebugApiEnabled()).toBeFalsy();
  });

  test("allows debug API in non-production when enabled", () => {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_DEBUG_ENABLED = "1";
    expect(isDebugApiEnabled()).toBeTruthy();
  });

  test("requires explicit prod override when production-like", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_DEBUG_ENABLED = "true";
    delete process.env.ADMIN_DEBUG_ALLOW_PROD;
    expect(isDebugApiEnabled()).toBeFalsy();
    process.env.ADMIN_DEBUG_ALLOW_PROD = "yes";
    expect(isDebugApiEnabled()).toBeTruthy();
  });

  test("fails closed on malformed env values", () => {
    process.env.NODE_ENV = "production\r\n";
    process.env.ADMIN_DEBUG_ENABLED = `1${"x".repeat(24)}`;
    process.env.ADMIN_DEBUG_ALLOW_PROD = "true";
    expect(isDebugApiEnabled()).toBeFalsy();
  });
});
