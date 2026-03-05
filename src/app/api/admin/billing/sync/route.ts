export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { runBillingMaintenance } from "@/lib/billingSubscription";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

function authErrorCode(e: unknown): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  const msg = e instanceof Error ? e.message : String(e || "");
  if (msg === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (msg === "FORBIDDEN") return "FORBIDDEN";
  return null;
}

export async function POST(req: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }

  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_BILLING_SYNC_MS", 30_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("stripe_admin");
        const u = await requirePermission("billing.manage");
        const result = await runBillingMaintenance({
          maxUsers: Math.max(1, Math.min(5000, Number(process.env.BILLING_MAINTENANCE_MAX_USERS || 500))),
        });

        await appendImmutableAudit({
          streamKey: `user:${u.id}:billing`,
          action: "billing.maintenance.manual_run",
          actorUserId: u.id,
          orgId: u.orgId ?? null,
          payload: result,
        });

        await logSecurityEvent({
          type: "billing_maintenance_manual_run",
          severity: "medium",
          actorUserId: u.id,
          orgId: u.orgId ?? null,
          scope: "billing",
          message: "Manual billing maintenance run completed",
          meta: result,
        });

        return NextResponse.redirect(new URL("/admin/billing/stripe?sync=ok", appBaseUrl), { status: 303 });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRuntimeEnvError(e)) {
      return NextResponse.redirect(new URL("/admin/billing/stripe?error=ENV_MISCONFIGURED", appBaseUrl), { status: 303 });
    }
    if (isRouteTimeoutError(e)) {
      await logSecurityEvent({
        type: "billing_maintenance_timeout",
        severity: "high",
        scope: "billing",
        message: "Manual billing maintenance exceeded timeout",
        meta: { timeoutMs },
      });
      return NextResponse.redirect(new URL("/admin/billing/stripe?error=TIMEOUT", appBaseUrl), { status: 303 });
    }
    const authCode = authErrorCode(e);
    const safeError =
      authCode
        ? "FORBIDDEN"
        : "BILLING_SYNC_FAILED";
    await logSecurityEvent({
      type: "billing_maintenance_failed",
      severity: "medium",
      scope: "billing",
      message: "Manual billing maintenance failed",
      meta: { code: safeError },
    });
    return NextResponse.redirect(new URL(`/admin/billing/stripe?error=${encodeURIComponent(safeError)}`, appBaseUrl), { status: 303 });
  }
}
