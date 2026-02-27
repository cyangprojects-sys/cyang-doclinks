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

    const returnUrl = `${baseUrl(req)}/admin/billing`;
    const portal = await stripeApi("billing_portal/sessions", {
      method: "POST",
      body: {
        customer: customerId,
        return_url: returnUrl,
      },
    });

    const portalUrl = String(portal?.url || "").trim();
    if (!portalUrl) throw new Error("Stripe portal did not return a URL");

    await appendImmutableAudit({
      streamKey: `user:${u.id}:billing`,
      action: "billing.portal_session.created",
      actorUserId: u.id,
      orgId: u.orgId ?? null,
      payload: {
        customerId,
      },
    });

    return NextResponse.redirect(portalUrl, { status: 303 });
  } catch (e: any) {
    const msg = String(e?.message || e || "portal_failed");
    await logSecurityEvent({
      type: "billing_portal_failed",
      severity: "medium",
      scope: "billing",
      message: msg,
    });
    return NextResponse.redirect(new URL(`/admin/billing?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
  }
}

