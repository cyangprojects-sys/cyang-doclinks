export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authz";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, stripeApi } from "@/lib/stripeClient";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { getBillingFlags } from "@/lib/settings";

function baseUrl(req: NextRequest): string {
  const configured =
    String(process.env.APP_URL || "").trim() ||
    String(process.env.NEXTAUTH_URL || "").trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin.replace(/\/+$/, "");
}

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
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_CHECKOUT_MS", 15_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("stripe_admin");
        const flags = await getBillingFlags();
        if (!flags.flags.pricingUiEnabled) {
          return NextResponse.redirect(new URL("/admin/dashboard", req.url), { status: 303 });
        }

        const u = await requireUser();
        const existingCustomerId = await readExistingCustomerId(u.id);
        const customerId = await ensureStripeCustomer({
          userId: u.id,
          email: u.email,
          existingCustomerId,
        });
        if (customerId !== existingCustomerId) {
          await persistCustomerId(u.id, customerId);
        }

        const origin = baseUrl(req);
        const successUrl = `${origin}/admin/upgrade?checkout=success`;
        const cancelUrl = `${origin}/admin/upgrade?checkout=canceled`;
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

        const checkoutUrl = String(session?.url || "").trim();
        if (!checkoutUrl) throw new Error("Stripe checkout did not return a session URL");

        await appendImmutableAudit({
          streamKey: `user:${u.id}:billing`,
          action: "billing.checkout_session.created.viewer",
          actorUserId: u.id,
          orgId: u.orgId ?? null,
          payload: { customerId, priceId },
        });

        return NextResponse.redirect(checkoutUrl, { status: 303 });
      })(),
      timeoutMs
    );
  } catch (e: any) {
    if (isRuntimeEnvError(e)) {
      return NextResponse.redirect(new URL("/admin/upgrade?error=ENV_MISCONFIGURED", req.url), { status: 303 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "billing_checkout_timeout",
        severity: "high",
        scope: "billing",
        message: "Viewer checkout session creation exceeded timeout",
        meta: { timeoutMs },
      });
      return NextResponse.redirect(new URL("/admin/upgrade?error=TIMEOUT", req.url), { status: 303 });
    }
    const msg = String(e?.message || e || "checkout_failed");
    const safeError =
      msg === "FORBIDDEN" || msg === "UNAUTHENTICATED"
        ? "FORBIDDEN"
        : msg === "STRIPE_PRO_PRICE_IDS is not configured"
          ? "ENV_MISCONFIGURED"
          : "CHECKOUT_FAILED";
    await logSecurityEvent({
      type: "billing_checkout_failed",
      severity: "medium",
      scope: "billing",
      message: "Viewer checkout session creation failed",
      meta: { code: safeError },
    });
    return NextResponse.redirect(new URL(`/admin/upgrade?error=${encodeURIComponent(safeError)}`, req.url), { status: 303 });
  }
}
