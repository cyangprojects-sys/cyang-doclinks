export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { ensureStripeCustomer, safeStripeRedirectUrl, stripeApi } from "@/lib/stripeClient";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

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

function authErrorCode(e: unknown): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  const msg = e instanceof Error ? e.message : String(e || "");
  if (msg === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (msg === "FORBIDDEN") return "FORBIDDEN";
  return null;
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
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_billing_portal",
    limit: Number(process.env.RATE_LIMIT_ADMIN_BILLING_PORTAL_PER_MIN || 60),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.redirect(new URL("/admin/billing?error=RATE_LIMIT", appBaseUrl), { status: 303 });
  }

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

        const returnUrl = `${appBaseUrl}/admin/billing`;
        const portal = await stripeApi("billing_portal/sessions", {
          method: "POST",
          body: {
            customer: customerId,
            return_url: returnUrl,
          },
        });

        const portalUrl = safeStripeRedirectUrl(String(portal?.url || "").trim());

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
      return NextResponse.redirect(new URL("/admin/billing?error=ENV_MISCONFIGURED", appBaseUrl), { status: 303 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "billing_portal_timeout",
        severity: "high",
        scope: "billing",
        message: "Portal session creation exceeded timeout",
        meta: { timeoutMs },
      });
      return NextResponse.redirect(new URL("/admin/billing?error=TIMEOUT", appBaseUrl), { status: 303 });
    }
    const msg = e instanceof Error ? e.message : String(e || "portal_failed");
    const authCode = authErrorCode(e);
    const safeError =
      authCode
        ? "FORBIDDEN"
        : msg === "STRIPE_SECRET_KEY is not configured"
          ? "ENV_MISCONFIGURED"
          : msg.startsWith("APP_BASE_URL_")
          ? "ENV_MISCONFIGURED"
          : "PORTAL_FAILED";
    await logSecurityEvent({
      type: "billing_portal_failed",
      severity: "medium",
      scope: "billing",
      message: "Stripe portal session creation failed",
      meta: { code: safeError },
    });
    return NextResponse.redirect(new URL(`/admin/billing?error=${encodeURIComponent(safeError)}`, appBaseUrl), { status: 303 });
  }
}
