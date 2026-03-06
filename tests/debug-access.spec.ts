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

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "string") env[key] = value;
  else delete env[key];
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
    setEnv("NODE_ENV", "development");
    setEnv("ADMIN_DEBUG_ENABLED", undefined);
    expect(isDebugApiEnabled()).toBeFalsy();
  });

  test("allows debug API in non-production when enabled", () => {
    setEnv("NODE_ENV", "development");
    setEnv("ADMIN_DEBUG_ENABLED", "1");
    expect(isDebugApiEnabled()).toBeTruthy();
  });

  test("requires explicit prod override when production-like", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ADMIN_DEBUG_ENABLED", "true");
    setEnv("ADMIN_DEBUG_ALLOW_PROD", undefined);
    expect(isDebugApiEnabled()).toBeFalsy();
    setEnv("ADMIN_DEBUG_ALLOW_PROD", "yes");
    expect(isDebugApiEnabled()).toBeTruthy();
  });

  test("fails closed on malformed env values", () => {
    setEnv("NODE_ENV", "production\r\n");
    setEnv("ADMIN_DEBUG_ENABLED", `1${"x".repeat(24)}`);
    setEnv("ADMIN_DEBUG_ALLOW_PROD", "true");
    expect(isDebugApiEnabled()).toBeFalsy();
  });
});
