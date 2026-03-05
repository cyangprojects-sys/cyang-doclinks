export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getPlanForUser } from "@/lib/monetization";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

function authErrorCode(e: unknown): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  const msg = e instanceof Error ? e.message : String(e || "");
  if (msg === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (msg === "FORBIDDEN") return "FORBIDDEN";
  return null;
}

export async function GET(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_STATUS_MS", 10_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:admin_billing_status",
          limit: Number(process.env.RATE_LIMIT_ADMIN_BILLING_STATUS_PER_MIN || 60),
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
        const plan = await getPlanForUser(u.id);
        const snapshot = await getBillingSnapshotForUser(u.id);
        const entitlement = classifyBillingEntitlement(snapshot.subscription);
        return NextResponse.json({
          ok: true,
          user: { id: u.id, email: u.email },
          effectivePlan: plan,
          entitlement,
          subscription: snapshot.subscription,
          webhookEvents: snapshot.events,
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
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
