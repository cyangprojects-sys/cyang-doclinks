import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import { verifyStripeWebhookSignature } from "../src/lib/stripeWebhook";

function signRaw(raw: string, secret: string, ts: number): string {
  const v1 = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

test.describe("stripe webhook signature verifier", () => {
  test("rejects when webhook secret is missing", () => {
    const out = verifyStripeWebhookSignature({
      rawBody: "{}",
      signatureHeader: "t=1,v1=deadbeef",
      secret: "",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("MISSING_WEBHOOK_SECRET");
  });

  test("rejects when signature header is missing", () => {
    const out = verifyStripeWebhookSignature({
      rawBody: "{}",
      signatureHeader: null,
      secret: "whsec_test",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("MISSING_SIGNATURE_HEADER");
  });

  test("rejects malformed signature header", () => {
    const out = verifyStripeWebhookSignature({
      rawBody: "{}",
      signatureHeader: "v1=deadbeef",
      secret: "whsec_test",
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("INVALID_SIGNATURE_HEADER");
  });

  test("rejects timestamp outside tolerance", () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ id: "evt_old", type: "invoice.payment_failed" });
    const oldTs = Math.floor(Date.now() / 1000) - 3600;
    const out = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: signRaw(rawBody, secret, oldTs),
      secret,
      toleranceSeconds: 300,
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("SIGNATURE_TIMESTAMP_OUT_OF_TOLERANCE");
  });

  test("rejects signature mismatch", () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ id: "evt_bad_sig", type: "invoice.payment_failed" });
    const ts = Math.floor(Date.now() / 1000);
    const out = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: signRaw(rawBody, `${secret}_wrong`, ts),
      secret,
      toleranceSeconds: 300,
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("SIGNATURE_MISMATCH");
  });

  test("rejects signed invalid JSON", () => {
    const secret = "whsec_test";
    const rawBody = "{ not-json";
    const ts = Math.floor(Date.now() / 1000);
    const out = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: signRaw(rawBody, secret, ts),
      secret,
      toleranceSeconds: 300,
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("INVALID_JSON");
  });

  test("rejects signed malformed event payload", () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ data: { object: {} } });
    const ts = Math.floor(Date.now() / 1000);
    const out = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: signRaw(rawBody, secret, ts),
      secret,
      toleranceSeconds: 300,
    });
    expect(out.ok).toBeFalsy();
    if (!out.ok) expect(out.error).toBe("MALFORMED_EVENT");
  });

  test("accepts valid signature and payload", () => {
    const secret = "whsec_test";
    const payload = { id: "evt_ok", type: "invoice.payment_succeeded", data: { object: {} } };
    const rawBody = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000);
    const out = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: signRaw(rawBody, secret, ts),
      secret,
      toleranceSeconds: 300,
    });
    expect(out.ok).toBeTruthy();
    if (out.ok) {
      expect(out.eventId).toBe("evt_ok");
      expect(out.eventType).toBe("invoice.payment_succeeded");
    }
  });
});
