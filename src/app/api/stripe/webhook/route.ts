export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhookSignature } from "@/lib/stripeWebhook";
import {
  beginWebhookEvent,
  billingTablesReady,
  completeWebhookEvent,
  getUserIdByStripeCustomerId,
  markPaymentFailure,
  markPaymentSucceeded,
  syncUserPlanFromSubscription,
  unixToIso,
  upsertStripeSubscription,
} from "@/lib/billingSubscription";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

function planFromStripePriceId(priceId: string | null): "free" | "pro" {
  const proPrices = String(process.env.STRIPE_PRO_PRICE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (priceId && proPrices.includes(priceId)) return "pro";
  return "pro";
}

function getSubPriceId(obj: any): string | null {
  try {
    const arr = obj?.items?.data;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return String(arr[0]?.price?.id || "").trim() || null;
  } catch {
    return null;
  }
}

function getGraceDays(): number {
  const n = Number(process.env.STRIPE_GRACE_DAYS || 7);
  if (!Number.isFinite(n)) return 7;
  return Math.max(0, Math.floor(n));
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const verified = verifyStripeWebhookSignature({
    rawBody,
    signatureHeader: signature,
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
    toleranceSeconds: Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || 300),
  });

  if (!verified.ok) {
    await logSecurityEvent({
      type: "stripe_webhook_invalid_signature",
      severity: "high",
      ip: req.headers.get("x-forwarded-for") || null,
      scope: "billing_webhook",
      message: verified.error,
    });
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  const ready = await billingTablesReady();
  if (!ready) {
    return NextResponse.json({ ok: false, error: "BILLING_TABLES_NOT_READY" }, { status: 503 });
  }

  const dedupe = await beginWebhookEvent(verified.eventId, verified.eventType, verified.payload);
  if (dedupe === "duplicate") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const event = verified.payload;
  const obj = event?.data?.object ?? {};
  const eventType = String(event?.type || "");

  let webhookStatus: "processed" | "ignored" | "failed" = "processed";
  let webhookMessage: string | null = null;

  try {
    if (
      eventType === "customer.subscription.created" ||
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      const stripeSubscriptionId = String(obj?.id || "").trim();
      const stripeCustomerId = String(obj?.customer || "").trim() || null;
      const metadataUserId = String(obj?.metadata?.user_id || "").trim() || null;
      const userId = metadataUserId || (await getUserIdByStripeCustomerId(stripeCustomerId));

      const status = String(obj?.status || (eventType.endsWith(".deleted") ? "canceled" : "incomplete")).toLowerCase();
      const planId = planFromStripePriceId(getSubPriceId(obj));
      const currentPeriodEnd = unixToIso(obj?.current_period_end);
      const cancelAtPeriodEnd = Boolean(obj?.cancel_at_period_end);

      await upsertStripeSubscription({
        userId,
        stripeCustomerId,
        stripeSubscriptionId,
        status,
        planId,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        graceUntil: null,
      });

      if (userId) {
        await syncUserPlanFromSubscription(userId);
      }
    } else if (eventType === "invoice.payment_failed") {
      const stripeSubscriptionId = String(obj?.subscription || "").trim() || null;
      const stripeCustomerId = String(obj?.customer || "").trim() || null;
      const userId = await getUserIdByStripeCustomerId(stripeCustomerId);
      await markPaymentFailure({
        stripeSubscriptionId,
        stripeCustomerId,
        graceDays: getGraceDays(),
      });
      if (userId) await syncUserPlanFromSubscription(userId);
    } else if (eventType === "invoice.payment_succeeded") {
      const stripeSubscriptionId = String(obj?.subscription || "").trim() || null;
      const stripeCustomerId = String(obj?.customer || "").trim() || null;
      const userId = await getUserIdByStripeCustomerId(stripeCustomerId);
      await markPaymentSucceeded({
        stripeSubscriptionId,
        stripeCustomerId,
      });
      if (userId) await syncUserPlanFromSubscription(userId);
    } else {
      webhookStatus = "ignored";
      webhookMessage = `Unhandled event type: ${eventType}`;
    }

    await appendImmutableAudit({
      streamKey: "billing:stripe_webhook",
      action: `billing.stripe.${eventType}`,
      subjectId: verified.eventId,
      payload: {
        eventType,
      },
    });
  } catch (e: any) {
    webhookStatus = "failed";
    webhookMessage = String(e?.message || e || "webhook_failed");
    await logSecurityEvent({
      type: "stripe_webhook_processing_failed",
      severity: "high",
      ip: req.headers.get("x-forwarded-for") || null,
      scope: "billing_webhook",
      message: webhookMessage,
      meta: { eventType, eventId: verified.eventId },
    });
  }

  await completeWebhookEvent(verified.eventId, webhookStatus, webhookMessage);

  if (webhookStatus === "failed") {
    return NextResponse.json({ ok: false, error: webhookMessage || "failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: webhookStatus });
}
