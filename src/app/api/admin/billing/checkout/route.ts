export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, stripeApi } from "@/lib/stripeClient";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

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
  try {
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

    const origin = baseUrl(req);
    const successUrl = `${origin}/admin/billing?checkout=success`;
    const cancelUrl = `${origin}/admin/billing?checkout=canceled`;
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
      action: "billing.checkout_session.created",
      actorUserId: u.id,
      orgId: u.orgId ?? null,
      payload: {
        customerId,
        priceId,
      },
    });

    return NextResponse.redirect(checkoutUrl, { status: 303 });
  } catch (e: any) {
    const msg = String(e?.message || e || "checkout_failed");
    await logSecurityEvent({
      type: "billing_checkout_failed",
      severity: "medium",
      scope: "billing",
      message: msg,
    });
    return NextResponse.redirect(new URL(`/admin/billing?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
  }
}

