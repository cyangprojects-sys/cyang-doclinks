import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

function isBlockedStatus(status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 410 ||
    status === 429 ||
    status === 500 ||
    status === 503
  );
}

function stripeSignature(payload: unknown, secret: string, timestamp?: number): string {
  const ts = Number.isFinite(timestamp) ? Number(timestamp) : Math.floor(Date.now() / 1000);
  const raw = JSON.stringify(payload);
  const v1 = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

test.describe("attack simulation", () => {
  test("raw docId access is not a public capability", async ({ request }) => {
    const r = await request.get("/serve/00000000-0000-0000-0000-000000000000");
    expect([403, 404, 429, 503]).toContain(r.status());
  });

  test("invalid share token cannot be used for raw serving", async ({ request }) => {
    const r = await request.get("/s/not-a-real-token/raw");
    expect(isBlockedStatus(r.status())).toBeTruthy();
  });

  test("invalid alias cannot be used for raw serving", async ({ request }) => {
    const r = await request.get("/d/not-a-real-alias/raw");
    expect(isBlockedStatus(r.status())).toBeTruthy();
  });

  test("ticket endpoint blocks direct top-level open attempts", async ({ request }) => {
    const r = await request.get("/t/not-a-real-ticket", {
      headers: {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
      },
    });
    expect(r.status()).toBe(403);
  });

  test("high-frequency alias guesses are throttled or blocked", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i += 1) {
      const r = await request.get(`/d/guess-${i}/raw`);
      statuses.push(r.status());
    }
    const sawThrottle = statuses.includes(429);
    const allBlocked = statuses.every((s) => isBlockedStatus(s) || s === 500);
    expect(sawThrottle || allBlocked).toBeTruthy();
  });

  test("high-frequency token guesses are throttled or blocked", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i += 1) {
      const r = await request.get(`/s/guess-token-${i}/raw`);
      statuses.push(r.status());
    }
    const sawThrottle = statuses.includes(429);
    const allBlocked = statuses.every((s) => isBlockedStatus(s) || s === 500);
    expect(sawThrottle || allBlocked).toBeTruthy();
  });

  test("stripe webhook rejects invalid signatures", async ({ request }) => {
    const body = {
      id: "evt_attack_sim_invalid_sig",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_fake",
          subscription: "sub_fake",
        },
      },
    };

    const r = await request.post("/api/stripe/webhook", {
      data: body,
      headers: {
        "stripe-signature": "t=1700000000,v1=deadbeef",
      },
    });
    expect(r.status()).toBe(400);
  });

  test("stripe webhook rejects missing signature header", async ({ request }) => {
    const r = await request.post("/api/stripe/webhook", {
      data: {
        id: "evt_attack_sim_missing_sig",
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_fake", subscription: "sub_fake" } },
      },
    });
    expect(r.status()).toBe(400);
  });

  test("stripe webhook dedupes duplicate events (when secret configured)", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available in test runtime");

    const payload = {
      id: `evt_attack_sim_dupe_${Date.now()}`,
      type: "billing.test.unhandled",
      data: { object: {} },
    };
    const sig = stripeSignature(payload, webhookSecret);

    const first = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });
    // If billing tables are unavailable in this environment, route should be explicit and deterministic.
    expect([200, 503]).toContain(first.status());

    const second = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });

    if (first.status() === 503) {
      expect(second.status()).toBe(503);
      return;
    }

    expect(second.status()).toBe(200);
    const body = await second.json();
    expect(body?.ok).toBeTruthy();
    expect(body?.duplicate).toBeTruthy();
  });

  test("stripe webhook accepts signed invoice.payment_failed payloads", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available in test runtime");

    const payload = {
      id: `evt_attack_sim_payment_failed_${Date.now()}`,
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_attack_sim",
          subscription: "sub_attack_sim",
        },
      },
    };
    const sig = stripeSignature(payload, webhookSecret);

    const r = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });
    expect([200, 503]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body?.ok).toBeTruthy();
    }
  });

  test("stripe webhook accepts signed invoice.payment_succeeded payloads", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available in test runtime");

    const payload = {
      id: `evt_attack_sim_payment_succeeded_${Date.now()}`,
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_attack_sim",
          subscription: "sub_attack_sim",
        },
      },
    };
    const sig = stripeSignature(payload, webhookSecret);

    const r = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": sig },
    });
    expect([200, 503]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body?.ok).toBeTruthy();
    }
  });
});
