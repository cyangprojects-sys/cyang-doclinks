export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, safeStripeRedirectUrl, stripeApi } from "@/lib/stripeClient";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

function getProPriceId(): string {
  const ids = String(process.env.STRIPE_PRO_PRICE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) throw new Error("STRIPE_PRO_PRICE_IDS is not configured");
  return ids[0];
}

async function readExistingCustomerId(userId: string): Promise<string | null> {
  try {
    const rows = (await sql`
      select stripe_customer_id::text as stripe_customer_id
      from public.users
      where id = ${userId}::uuid
      limit 1
    `) as unknown as Array<{ stripe_customer_id: string | null }>;
    return rows?.[0]?.stripe_customer_id ?? null;
  } catch {
    return null;
  }
}

async function persistCustomerId(userId: string, customerId: string): Promise<void> {
  try {
    await sql`
      update public.users
      set stripe_customer_id = ${customerId}
      where id = ${userId}::uuid
    `;
  } catch {
    // optional column in older schemas
  }
}

export async function POST(req: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }

  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_CHECKOUT_MS", 15_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("stripe_admin");
        const u = await requirePermission("billing.manage");
        const existingCustomerId = await readExistingCustomerId(u.id);
        const customerId = await ensureStripeCustomer({
          userId: u.id,
          email: u.email,
          existingCustomerId,
        });
        if (customerId !== existingCustomerId) {
          await persistCustomerId(u.id, customerId);
        }

        const successUrl = `${appBaseUrl}/admin/billing?checkout=success`;
        const cancelUrl = `${appBaseUrl}/admin/billing?checkout=canceled`;
        const priceId = getProPriceId();

        const session = await stripeApi("checkout/sessions", {
          method: "POST",
          body: {
            mode: "subscription",
            customer: customerId,
            "line_items[0][price]": priceId,
            "line_items[0][quantity]": "1",
            success_url: successUrl,
            cancel_url: cancelUrl,
            "metadata[user_id]": u.id,
          },
        });

        const checkoutUrl = safeStripeRedirectUrl(String(session?.url || "").trim());

        await appendImmutableAudit({
          streamKey: `user:${u.id}:billing`,
          action: "billing.checkout_session.created",
          actorUserId: u.id,
          orgId: u.orgId ?? null,
          payload: {
            customerId,
            priceId,
          },
        });

        return NextResponse.redirect(checkoutUrl, { status: 303 });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRuntimeEnvError(e)) {
      return NextResponse.redirect(new URL("/admin/billing?error=ENV_MISCONFIGURED", appBaseUrl), { status: 303 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "billing_checkout_timeout",
        severity: "high",
        scope: "billing",
        message: "Checkout session creation exceeded timeout",
        meta: { timeoutMs },
      });
      return NextResponse.redirect(new URL("/admin/billing?error=TIMEOUT", appBaseUrl), { status: 303 });
    }
    const msg = e instanceof Error ? e.message : String(e || "checkout_failed");
    const safeError =
      msg === "FORBIDDEN" || msg === "UNAUTHENTICATED"
        ? "FORBIDDEN"
        : msg === "STRIPE_PRO_PRICE_IDS is not configured"
          ? "ENV_MISCONFIGURED"
          : msg.startsWith("APP_BASE_URL_")
          ? "ENV_MISCONFIGURED"
          : "CHECKOUT_FAILED";
    await logSecurityEvent({
      type: "billing_checkout_failed",
      severity: "medium",
      scope: "billing",
      message: "Stripe checkout session creation failed",
      meta: { code: safeError },
    });
    return NextResponse.redirect(new URL(`/admin/billing?error=${encodeURIComponent(safeError)}`, appBaseUrl), { status: 303 });
  }
}
