import { expect, test } from "@playwright/test";
import { logAccess } from "../src/lib/logAccess";

function setEnv(name: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "undefined") delete env[name];
  else env[name] = value;
}

test.describe("log access guardrails", () => {
  const snap = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  test.afterEach(() => {
    setEnv("NODE_ENV", snap.NODE_ENV);
    setEnv("DATABASE_URL", snap.DATABASE_URL);
  });

  test("never throws and redacts internals in production mode", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("DATABASE_URL", undefined);

    const seen: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      seen.push(args.map((v) => String(v)).join(" "));
    };

    try {
      await expect(
        logAccess({ docId: "00000000-0000-0000-0000-000000000000", alias: "a", token: "t", ip: "1.2.3.4" })
      ).resolves.toBeUndefined();
    } finally {
      console.warn = originalWarn;
    }

    expect(seen.some((msg) => msg.includes("Failed to log access."))).toBeTruthy();
    expect(seen.some((msg) => msg.includes("DATABASE_URL"))).toBeFalsy();
  });
});
