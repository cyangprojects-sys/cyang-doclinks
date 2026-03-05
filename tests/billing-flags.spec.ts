import { expect, test } from "@playwright/test";
import { enforcePlanLimitsEnabled, pricingUiEnabled, proPlanEnabled } from "../src/lib/billingFlags";

const ENV_KEYS = ["ENFORCE_PLAN_LIMITS", "PRO_PLAN_ENABLED", "PRICING_UI_ENABLED"] as const;
type Snapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function setEnv(name: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "undefined") delete env[name];
  else env[name] = value;
}

function takeSnapshot(): Snapshot {
  return {
    ENFORCE_PLAN_LIMITS: process.env.ENFORCE_PLAN_LIMITS,
    PRO_PLAN_ENABLED: process.env.PRO_PLAN_ENABLED,
    PRICING_UI_ENABLED: process.env.PRICING_UI_ENABLED,
  };
}

function restoreSnapshot(s: Snapshot) {
  for (const k of ENV_KEYS) setEnv(k, s[k]);
}

test.describe("billing flag helpers", () => {
  let snapshot: Snapshot;

  test.beforeEach(() => {
    snapshot = takeSnapshot();
  });

  test.afterEach(() => {
    restoreSnapshot(snapshot);
  });

  test("uses secure defaults when env vars are missing", () => {
    for (const k of ENV_KEYS) setEnv(k, undefined);
    expect(enforcePlanLimitsEnabled()).toBeTruthy();
    expect(proPlanEnabled()).toBeFalsy();
    expect(pricingUiEnabled()).toBeFalsy();
  });

  test("parses explicit truthy and falsy values", () => {
    setEnv("ENFORCE_PLAN_LIMITS", "0");
    setEnv("PRO_PLAN_ENABLED", "yes");
    setEnv("PRICING_UI_ENABLED", "on");
    expect(enforcePlanLimitsEnabled()).toBeFalsy();
    expect(proPlanEnabled()).toBeTruthy();
    expect(pricingUiEnabled()).toBeTruthy();
  });

  test("falls back to defaults for unknown env tokens", () => {
    setEnv("ENFORCE_PLAN_LIMITS", "garbage");
    setEnv("PRO_PLAN_ENABLED", "garbage");
    setEnv("PRICING_UI_ENABLED", "garbage");
    expect(enforcePlanLimitsEnabled()).toBeTruthy();
    expect(proPlanEnabled()).toBeFalsy();
    expect(pricingUiEnabled()).toBeFalsy();
  });

  test("fails closed on malformed env values", () => {
    setEnv("ENFORCE_PLAN_LIMITS", `yes${"x".repeat(32)}`);
    setEnv("PRO_PLAN_ENABLED", "true\r\n");
    setEnv("PRICING_UI_ENABLED", `on${"x".repeat(32)}`);
    expect(enforcePlanLimitsEnabled()).toBeTruthy();
    expect(proPlanEnabled()).toBeFalsy();
    expect(pricingUiEnabled()).toBeFalsy();
  });
});
