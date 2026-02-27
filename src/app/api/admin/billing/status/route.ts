export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getPlanForUser } from "@/lib/monetization";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";

export async function GET() {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_STATUS_MS", 10_000);
  try {
    return await withRouteTimeout(
      (async () => {
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
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
