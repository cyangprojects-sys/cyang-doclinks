import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { WEBHOOK_EVENTS, normalizeWebhookEvents } from "../src/lib/webhooks";

test.describe("webhook event guardrails", () => {
  test("normalizes to known events only and deduplicates", () => {
    const out = normalizeWebhookEvents([
      "share.created",
      "share.created",
      "webhook.test",
      "not.real.event",
      "",
    ]);
    expect(out).toEqual(["share.created", "webhook.test"]);
  });

  test("webhook event list remains explicit and non-empty", () => {
    expect(WEBHOOK_EVENTS.length).toBeGreaterThan(0);
    expect(WEBHOOK_EVENTS.includes("share.created")).toBeTruthy();
    expect(WEBHOOK_EVENTS.includes("webhook.test")).toBeTruthy();
  });

  test("admin webhook actions normalize selected event values", () => {
    const code = readFileSync("src/app/admin/(owner)/webhooks/actions.ts", "utf8");
    expect(code.includes("normalizeWebhookEvents(")).toBeTruthy();
  });
});
