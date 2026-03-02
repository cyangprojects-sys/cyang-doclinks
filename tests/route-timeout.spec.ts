import { expect, test } from "@playwright/test";
import {
  getRouteTimeoutMs,
  isRouteTimeoutError,
  RouteTimeoutError,
  withRouteTimeout,
} from "../src/lib/routeTimeout";

test.describe("route timeout helpers", () => {
  test("getRouteTimeoutMs uses fallback on invalid values", () => {
    process.env.TEST_TIMEOUT_MS = "not-a-number";
    expect(getRouteTimeoutMs("TEST_TIMEOUT_MS", 25_000)).toBe(25_000);
    process.env.TEST_TIMEOUT_MS = "-1";
    expect(getRouteTimeoutMs("TEST_TIMEOUT_MS", 25_000)).toBe(25_000);
  });

  test("getRouteTimeoutMs clamps bounds", () => {
    process.env.TEST_TIMEOUT_MS = "10";
    expect(getRouteTimeoutMs("TEST_TIMEOUT_MS", 25_000)).toBe(1_000);
    process.env.TEST_TIMEOUT_MS = "999999";
    expect(getRouteTimeoutMs("TEST_TIMEOUT_MS", 25_000)).toBe(180_000);
  });

  test("getRouteTimeoutMs uses fallback when env is missing", () => {
    delete process.env.TEST_TIMEOUT_MS;
    expect(getRouteTimeoutMs("TEST_TIMEOUT_MS", 12_345)).toBe(12_345);
  });

  test("withRouteTimeout resolves when work finishes first", async () => {
    const out = await withRouteTimeout(Promise.resolve("ok"), 50);
    expect(out).toBe("ok");
  });

  test("withRouteTimeout rejects with RouteTimeoutError", async () => {
    const never = new Promise<string>(() => {});
    await expect(withRouteTimeout(never, 20)).rejects.toBeInstanceOf(RouteTimeoutError);
  });

  test("withRouteTimeout preserves underlying work errors", async () => {
    const boom = Promise.reject(new Error("boom"));
    await expect(withRouteTimeout(boom, 200)).rejects.toThrow("boom");
  });

  test("isRouteTimeoutError identifies class and message variants", () => {
    expect(isRouteTimeoutError(new RouteTimeoutError())).toBeTruthy();
    expect(isRouteTimeoutError(new Error("ROUTE_TIMEOUT"))).toBeTruthy();
    expect(isRouteTimeoutError(new Error("other"))).toBeFalsy();
  });
});
