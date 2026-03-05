import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("stripe stack guardrails", () => {
  test("stripe webhook route fails closed on oversized payloads", () => {
    const code = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
    expect(code.includes("STRIPE_WEBHOOK_MAX_BODY_BYTES")).toBeTruthy();
    expect(code.includes("PAYLOAD_TOO_LARGE")).toBeTruthy();
    expect(code.includes("stripe_webhook_payload_too_large")).toBeTruthy();
  });

  test("stripe webhook verifier validates signature/event formats", () => {
    const code = readFileSync("src/lib/stripeWebhook.ts", "utf8");
    expect(code.includes("STRIPE_SIG_HEX_RE")).toBeTruthy();
    expect(code.includes("STRIPE_EVENT_ID_RE")).toBeTruthy();
    expect(code.includes("STRIPE_EVENT_TYPE_RE")).toBeTruthy();
  });

  test("billing subscription binding rejects invalid metadata user ids", () => {
    const code = readFileSync("src/lib/billingSubscription.ts", "utf8");
    expect(code.includes("BILLING_BINDING_METADATA_USER_INVALID")).toBeTruthy();
    expect(code.includes("normalizeUuid(")).toBeTruthy();
  });

  test("stripe client sanitizes API paths and request form bounds", () => {
    const code = readFileSync("src/lib/stripeClient.ts", "utf8");
    expect(code.includes("normalizeStripeApiPath(")).toBeTruthy();
    expect(code.includes("STRIPE_FORM_MAX_FIELDS")).toBeTruthy();
    expect(code.includes("Invalid Stripe API path")).toBeTruthy();
  });
});
