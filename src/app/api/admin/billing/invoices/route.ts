export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, safeStripeRedirectUrl, stripeApi } from "@/lib/stripeClient";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
type StripeInvoiceLike = {
  id?: string;
  number?: string;
  status?: string;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  period_start?: number;
  period_end?: number;
  created?: number;
};
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function authErrorCode(e: unknown): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  const msg = errorMessage(e).trim();
  if (msg === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (msg === "FORBIDDEN") return "FORBIDDEN";
  return null;
}

function safeInvoiceUrl(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return safeStripeRedirectUrl(raw);
  } catch {
    return null;
  }
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

export async function GET(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_INVOICES_MS", 15_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:admin_billing_invoices",
          limit: Number(process.env.RATE_LIMIT_ADMIN_BILLING_INVOICES_PER_MIN || 60),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }

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
          invoices: items.map((inv: StripeInvoiceLike) => ({
            id: String(inv?.id || ""),
            number: String(inv?.number || ""),
            status: String(inv?.status || ""),
            amountDue: Number(inv?.amount_due || 0),
            amountPaid: Number(inv?.amount_paid || 0),
            currency: String(inv?.currency || "usd").toUpperCase(),
            hostedInvoiceUrl: safeInvoiceUrl(inv?.hosted_invoice_url),
            invoicePdf: safeInvoiceUrl(inv?.invoice_pdf),
            periodStart: Number(inv?.period_start || 0),
            periodEnd: Number(inv?.period_end || 0),
            created: Number(inv?.created || 0),
          })),
        });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRuntimeEnvError(e)) {
      return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 503 });
    }
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    const authCode = authErrorCode(e);
    if (authCode === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (authCode === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "BILLING_UPSTREAM_ERROR" }, { status: 502 });
  }
}
