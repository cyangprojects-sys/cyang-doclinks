import { expect, test } from "@playwright/test";
import { aggregateDocViewDaily, envInt } from "../src/lib/analytics";

function setEnv(name: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "undefined") delete env[name];
  else env[name] = value;
}

test.describe("analytics env helpers", () => {
  const key = "ANALYTICS_TEST_INT";
  const snapshot = process.env[key];

  test.afterEach(() => {
    setEnv(key, snapshot);
  });

  test("returns fallback for missing, invalid, and non-positive values", () => {
    setEnv(key, undefined);
    expect(envInt(key, 120)).toBe(120);

    setEnv(key, "not-a-number");
    expect(envInt(key, 120)).toBe(120);

    setEnv(key, "0");
    expect(envInt(key, 120)).toBe(120);

    setEnv(key, "-10");
    expect(envInt(key, 120)).toBe(120);
  });

  test("parses positive integer-like values and floors decimals", () => {
    setEnv(key, "42");
    expect(envInt(key, 120)).toBe(42);

    setEnv(key, "42.9");
    expect(envInt(key, 120)).toBe(42);

    setEnv(key, "  7 ");
    expect(envInt(key, 120)).toBe(7);
  });

  test("fails closed for malformed env values", () => {
    setEnv(key, "10\r\n");
    expect(envInt(key, 120)).toBe(120);
    setEnv(key, `8${"x".repeat(32)}`);
    expect(envInt(key, 120)).toBe(120);
  });

  test("aggregate helper clamps daysBack bounds when DB is unavailable", async () => {
    const dbSnapshot = process.env.DATABASE_URL;
    setEnv("DATABASE_URL", undefined);
    try {
      const low = await aggregateDocViewDaily({ daysBack: 0 });
      expect(low.daysBack).toBe(1);
      expect(low.ok).toBeFalsy();

      const high = await aggregateDocViewDaily({ daysBack: 999999 });
      expect(high.daysBack).toBe(3650);
      expect(high.ok).toBeFalsy();
    } finally {
      setEnv("DATABASE_URL", dbSnapshot);
    }
  });
});
