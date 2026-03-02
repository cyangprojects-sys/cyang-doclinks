import { expect, test } from "@playwright/test";
import { logStructured } from "../src/lib/observability";

type ConsoleMethod = (...args: unknown[]) => void;

test.describe("observability structured logging", () => {
  test("logs info/debug to console.log as JSON", () => {
    const original = console.log as ConsoleMethod;
    const calls: unknown[][] = [];
    console.log = (...args: unknown[]) => {
      calls.push(args);
    };

    try {
      logStructured({
        severity: "debug",
        event: "security.test",
        message: "hello",
        context: { actor: "tester" },
      });
    } finally {
      console.log = original;
    }

    expect(calls.length).toBe(1);
    const line = String(calls[0][0] || "");
    const parsed = JSON.parse(line) as {
      severity: string;
      event: string;
      message: string;
      context: Record<string, unknown>;
      ts: string;
    };
    expect(parsed.severity).toBe("debug");
    expect(parsed.event).toBe("security.test");
    expect(parsed.message).toBe("hello");
    expect(parsed.context.actor).toBe("tester");
    expect(Number.isNaN(Date.parse(parsed.ts))).toBeFalsy();
  });

  test("routes warn and error severities to matching console methods", () => {
    const originalWarn = console.warn as ConsoleMethod;
    const originalError = console.error as ConsoleMethod;
    let warned = 0;
    let errored = 0;
    console.warn = () => {
      warned += 1;
    };
    console.error = () => {
      errored += 1;
    };

    try {
      logStructured({ severity: "warn", event: "warn.event", message: "warn" });
      logStructured({ severity: "error", event: "error.event", message: "error" });
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }

    expect(warned).toBe(1);
    expect(errored).toBe(1);
  });
});
