export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, stripeApi } from "@/lib/stripeClient";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";

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

export async function GET(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_INVOICES_MS", 15_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("stripe_admin");
        const u = await requirePermission("billing.manage");
        const limitRaw = Number(new URL(req.url).searchParams.get("limit") || 20);
        const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 20));

        const existingCustomerId = await readExistingCustomerId(u.id);
        const customerId = await ensureStripeCustomer({
          userId: u.id,
          email: u.email,
          existingCustomerId,
        });
        if (customerId !== existingCustomerId) {
          await persistCustomerId(u.id, customerId);
        }

        const invoices = await stripeApi(`invoices?customer=${encodeURIComponent(customerId)}&limit=${limit}`, {
          method: "GET",
        });
        const items = Array.isArray(invoices?.data) ? invoices.data : [];

        return NextResponse.json({
          ok: true,
          customerId,
          invoices: items.map((inv: any) => ({
            id: String(inv?.id || ""),
            number: String(inv?.number || ""),
            status: String(inv?.status || ""),
            amountDue: Number(inv?.amount_due || 0),
            amountPaid: Number(inv?.amount_paid || 0),
            currency: String(inv?.currency || "usd").toUpperCase(),
            hostedInvoiceUrl: inv?.hosted_invoice_url ? String(inv.hosted_invoice_url) : null,
            invoicePdf: inv?.invoice_pdf ? String(inv.invoice_pdf) : null,
            periodStart: Number(inv?.period_start || 0),
            periodEnd: Number(inv?.period_end || 0),
            created: Number(inv?.created || 0),
          })),
        });
      })(),
      timeoutMs
    );
  } catch (e: any) {
    if (isRuntimeEnvError(e)) {
      return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 503 });
    }
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    const msg = String(e?.message || e || "failed");
    if (msg === "FORBIDDEN" || msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "BILLING_UPSTREAM_ERROR" }, { status: 502 });
  }
}
