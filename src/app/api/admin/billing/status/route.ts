export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getPlanForUser } from "@/lib/monetization";
import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";

export async function GET() {
  try {
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e || "failed") }, { status: 403 });
  }
}
