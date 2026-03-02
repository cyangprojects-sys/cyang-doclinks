export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, stripeApi } from "@/lib/stripeClient";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";

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
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_PORTAL_MS", 15_000);
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
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRuntimeEnvError(e)) {
      return NextResponse.redirect(new URL("/admin/billing?error=ENV_MISCONFIGURED", req.url), { status: 303 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "billing_portal_timeout",
        severity: "high",
        scope: "billing",
        message: "Portal session creation exceeded timeout",
        meta: { timeoutMs },
      });
      return NextResponse.redirect(new URL("/admin/billing?error=TIMEOUT", req.url), { status: 303 });
    }
    const msg = e instanceof Error ? e.message : String(e || "portal_failed");
    const safeError =
      msg === "FORBIDDEN" || msg === "UNAUTHENTICATED"
        ? "FORBIDDEN"
        : msg === "STRIPE_SECRET_KEY is not configured"
          ? "ENV_MISCONFIGURED"
          : "PORTAL_FAILED";
    await logSecurityEvent({
      type: "billing_portal_failed",
      severity: "medium",
      scope: "billing",
      message: "Stripe portal session creation failed",
      meta: { code: safeError },
    });
    return NextResponse.redirect(new URL(`/admin/billing?error=${encodeURIComponent(safeError)}`, req.url), { status: 303 });
  }
}
