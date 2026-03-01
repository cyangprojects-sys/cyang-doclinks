export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhookSignature } from "@/lib/stripeWebhook";
import {
  beginWebhookEvent,
  billingTablesReady,
  completeWebhookEvent,
  getUserIdByStripeCustomerId,
  markWebhookEventDuplicate,
  markPaymentFailure,
  markPaymentSucceeded,
  syncUserPlanFromSubscription,
  unixToIso,
  upsertStripeSubscription,
} from "@/lib/billingSubscription";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import {
  enforceGlobalApiRateLimit,
  enforceIpAbuseBlock,
  logDbErrorEvent,
  logSecurityEvent,
  maybeBlockIpOnAbuse,
} from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";

function planFromStripePriceId(priceId: string | null): "free" | "pro" {
  const proPrices = String(process.env.STRIPE_PRO_PRICE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (priceId && proPrices.includes(priceId)) return "pro";
  return "free";
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
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_STRIPE_WEBHOOK_MS", 15_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("stripe_webhook");
        const abuseBlock = await enforceIpAbuseBlock({ req, scope: "billing_webhook" });
        if (!abuseBlock.ok) {
          return NextResponse.json(
            { ok: false, error: "ABUSE_BLOCKED" },
            { status: 403, headers: { "Retry-After": String(abuseBlock.retryAfterSeconds) } }
          );
        }
        const webhookRl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:stripe_webhook",
          limit: Number(process.env.RATE_LIMIT_STRIPE_WEBHOOK_IP_PER_MIN || 300),
          windowSeconds: 60,
          strict: true,
        });
        if (!webhookRl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: webhookRl.status, headers: { "Retry-After": String(webhookRl.retryAfterSeconds) } }
          );
        }

        const rawBody = await req.text();
        const signature = req.headers.get("stripe-signature");
        const verified = verifyStripeWebhookSignature({
          rawBody,
          signatureHeader: signature,
          secret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
          toleranceSeconds: Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || 300),
        });

        if (!verified.ok) {
          const ip = req.headers.get("x-forwarded-for") || null;
          await logSecurityEvent({
            type: "stripe_webhook_invalid_signature",
            severity: "high",
            ip,
            scope: "billing_webhook",
            message: verified.error,
          });
          if (ip) {
            await maybeBlockIpOnAbuse({
              ip,
              category: "stripe_webhook_invalid_signature",
              scope: "billing_webhook",
              threshold: Number(process.env.ABUSE_BLOCK_STRIPE_SIG_THRESHOLD || 15),
              windowSeconds: Number(process.env.ABUSE_BLOCK_STRIPE_SIG_WINDOW_SECONDS || 600),
              blockSeconds: Number(process.env.ABUSE_BLOCK_TTL_SECONDS || 3600),
              reason: "Repeated invalid Stripe webhook signatures",
            });
          }
          return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });
        }

        const ready = await billingTablesReady();
        if (!ready) {
          return NextResponse.json({ ok: false, error: "BILLING_TABLES_NOT_READY" }, { status: 503 });
        }

        const dedupe = await beginWebhookEvent(verified.eventId, verified.eventType, verified.payload);
        if (dedupe === "duplicate") {
          await markWebhookEventDuplicate(verified.eventId);
          return NextResponse.json({ ok: true, duplicate: true });
        }

        const event = verified.payload;
        const obj = event?.data?.object ?? {};
        const eventType = String(event?.type || "");
        const eventCreatedUnix = Number.isFinite(Number(event?.created))
          ? Math.max(0, Math.floor(Number(event.created)))
          : null;

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
              eventCreatedUnix,
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
              eventCreatedUnix,
            });
            if (userId) await syncUserPlanFromSubscription(userId);
          } else if (eventType === "invoice.payment_succeeded") {
            const stripeSubscriptionId = String(obj?.subscription || "").trim() || null;
            const stripeCustomerId = String(obj?.customer || "").trim() || null;
            const userId = await getUserIdByStripeCustomerId(stripeCustomerId);
            await markPaymentSucceeded({
              stripeSubscriptionId,
              stripeCustomerId,
              eventCreatedUnix,
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
          await logDbErrorEvent({
            scope: "billing_webhook",
            message: webhookMessage,
            ip: req.headers.get("x-forwarded-for") || null,
            meta: { route: "/api/stripe/webhook", eventType, eventId: verified.eventId },
          });
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
          return NextResponse.json({ ok: false, error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
        }

        return NextResponse.json({ ok: true, status: webhookStatus });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (e instanceof Error) {
      await logDbErrorEvent({
        scope: "billing_webhook",
        message: e.message,
        ip: req.headers.get("x-forwarded-for") || null,
        meta: { route: "/api/stripe/webhook" },
      });
    }
    if (isRuntimeEnvError(e)) {
      return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 503 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "stripe_webhook_timeout",
        severity: "high",
        ip: req.headers.get("x-forwarded-for") || null,
        scope: "billing_webhook",
        message: "Stripe webhook processing exceeded timeout",
        meta: { timeoutMs },
      });
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    throw e;
  }
}
