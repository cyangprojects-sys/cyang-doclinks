export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { runBillingMaintenance } from "@/lib/billingSubscription";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export async function POST(req: NextRequest) {
  try {
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

    return NextResponse.redirect(new URL("/admin/billing/stripe?sync=ok", req.url), { status: 303 });
  } catch (e: any) {
    const msg = String(e?.message || e || "billing_sync_failed");
    return NextResponse.redirect(new URL(`/admin/billing/stripe?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
  }
}

