import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

function stripeSignature(payload: unknown, secret: string, timestamp?: number): string {
  const ts = Number.isFinite(timestamp) ? Number(timestamp) : Math.floor(Date.now() / 1000);
  const raw = JSON.stringify(payload);
  const v1 = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

function randSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function canUseBillingTables(sql: ReturnType<typeof neon>): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.billing_subscriptions')::text as reg`) as unknown as Array<{
      reg: string | null;
    }>;
    return Boolean(rows?.[0]?.reg);
  } catch {
    return false;
  }
}

test.describe("billing webhook integration", () => {
  test("transitions payment_failed -> past_due and payment_succeeded -> active", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available");
    test.skip(!databaseUrl, "DATABASE_URL not available");

    const sql = neon(databaseUrl);
    const ready = await canUseBillingTables(sql);
    test.skip(!ready, "billing_subscriptions table not available");

    const subId = `sub_test_${randSuffix()}`;
    const customerId = `cus_test_${randSuffix()}`;
    const failedEventId = `evt_billing_failed_${randSuffix()}`;
    const successEventId = `evt_billing_success_${randSuffix()}`;

    await sql`
      insert into public.billing_subscriptions
        (user_id, stripe_customer_id, stripe_subscription_id, status, plan_id, current_period_end, cancel_at_period_end, grace_until, updated_at)
      values
        (null, ${customerId}, ${subId}, 'active', 'pro', now() + interval '30 days', false, null, now())
      on conflict (stripe_subscription_id)
      do update set
        stripe_customer_id = excluded.stripe_customer_id,
        status = excluded.status,
        plan_id = excluded.plan_id,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        grace_until = excluded.grace_until,
        updated_at = now()
    `;

    const failedPayload = {
      id: failedEventId,
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: customerId,
          subscription: subId,
        },
      },
    };

    const failedResp = await request.post("/api/stripe/webhook", {
      data: failedPayload,
      headers: {
        "stripe-signature": stripeSignature(failedPayload, webhookSecret),
      },
    });
    expect(failedResp.status()).toBe(200);

    const afterFailed = (await sql`
      select
        status::text as status,
        grace_until::text as grace_until
      from public.billing_subscriptions
      where stripe_subscription_id = ${subId}
      limit 1
    `) as unknown as Array<{ status: string; grace_until: string | null }>;

    expect(afterFailed.length).toBe(1);
    expect(afterFailed[0].status).toBe("past_due");
    expect(afterFailed[0].grace_until).not.toBeNull();
    expect(Date.parse(String(afterFailed[0].grace_until))).toBeGreaterThan(Date.now());

    const successPayload = {
      id: successEventId,
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: customerId,
          subscription: subId,
        },
      },
    };

    const successResp = await request.post("/api/stripe/webhook", {
      data: successPayload,
      headers: {
        "stripe-signature": stripeSignature(successPayload, webhookSecret),
      },
    });
    expect(successResp.status()).toBe(200);

    const afterSuccess = (await sql`
      select
        status::text as status,
        grace_until::text as grace_until
      from public.billing_subscriptions
      where stripe_subscription_id = ${subId}
      limit 1
    `) as unknown as Array<{ status: string; grace_until: string | null }>;

    expect(afterSuccess.length).toBe(1);
    expect(afterSuccess[0].status).toBe("active");
    expect(afterSuccess[0].grace_until).toBeNull();

    await sql`delete from public.billing_subscriptions where stripe_subscription_id = ${subId}`;
    await sql`
      delete from public.billing_webhook_events
      where event_id in (${failedEventId}, ${successEventId})
    `;
  });

  test("records webhook event once for duplicate event id", async ({ request }) => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    test.skip(!webhookSecret, "STRIPE_WEBHOOK_SECRET not available");
    test.skip(!databaseUrl, "DATABASE_URL not available");

    const sql = neon(databaseUrl);
    const ready = await canUseBillingTables(sql);
    test.skip(!ready, "billing_subscriptions table not available");

    const eventId = `evt_billing_dupe_${randSuffix()}`;
    const payload = {
      id: eventId,
      type: "billing.test.unhandled",
      data: { object: {} },
    };

    const first = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: {
        "stripe-signature": stripeSignature(payload, webhookSecret),
      },
    });
    expect(first.status()).toBe(200);

    const second = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: {
        "stripe-signature": stripeSignature(payload, webhookSecret),
      },
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(Boolean(secondBody?.duplicate)).toBeTruthy();

    const rows = (await sql`
      select count(*)::int as c
      from public.billing_webhook_events
      where event_id = ${eventId}
    `) as unknown as Array<{ c: number }>;
    expect(Number(rows?.[0]?.c ?? 0)).toBe(1);

    await sql`delete from public.billing_webhook_events where event_id = ${eventId}`;
  });
});

