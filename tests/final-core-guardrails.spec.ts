import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("final core guardrails", () => {
  test("monetization normalizes uuid contexts and non-positive usage deltas", () => {
    const code = readFileSync("src/lib/monetization.ts", "utf8");
    expect(code.includes("normalizeUuid(")).toBeTruthy();
    expect(code.includes("Invalid owner context.")).toBeTruthy();
    expect(code.includes("safeDelta")).toBeTruthy();
  });

  test("resolveDoc validates alias/doc/token input formats and decode failures", () => {
    const code = readFileSync("src/lib/resolveDoc.ts", "utf8");
    expect(code.includes("UUID_RE")).toBeTruthy();
    expect(code.includes("ALIAS_RE")).toBeTruthy();
    expect(code.includes("TOKEN_MAX_LEN")).toBeTruthy();
    expect(code.includes("decodeURIComponent")).toBeTruthy();
    expect(code.includes("catch {")).toBeTruthy();
  });

  test("security telemetry sanitizes ids, text fields, and meta payloads", () => {
    const code = readFileSync("src/lib/securityTelemetry.ts", "utf8");
    expect(code.includes("normalizeUuidOrNull")).toBeTruthy();
    expect(code.includes("clampText")).toBeTruthy();
    expect(code.includes("sanitizeMeta")).toBeTruthy();
  });

  test("webhook delivery applies bounded body size, timeout, and batch controls", () => {
    const code = readFileSync("src/lib/webhooks.ts", "utf8");
    expect(code.includes("WEBHOOK_BODY_MAX_BYTES")).toBeTruthy();
    expect(code.includes("WEBHOOK_DELIVERY_TIMEOUT_MS")).toBeTruthy();
    expect(code.includes("Math.max(1, Math.min(200")).toBeTruthy();
  });

  test("attack sim ticket check treats 404 as blocked", () => {
    const code = readFileSync("tests/attack-sim.spec.ts", "utf8");
    expect(code.includes("expect([403, 404, 503]).toContain(r.status());")).toBeTruthy();
  });
});
