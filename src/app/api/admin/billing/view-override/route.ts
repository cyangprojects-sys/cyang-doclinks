export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { clearViewLimitOverride, setViewLimitOverride } from "@/lib/viewLimitOverride";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export async function POST(req: Request) {
  try {
    const u = await requirePermission("billing.override");
    const form = await req.formData();
    const action = String(form.get("action") || "").trim();
    const ownerId = String(form.get("ownerId") || u.id).trim();
    const reason = String(form.get("reason") || "").trim() || null;

    if (action === "set") {
      const hours = Math.max(1, Math.min(720, Number(form.get("hours") || 24)));
      await setViewLimitOverride({
        ownerId,
        actorUserId: u.id,
        hours,
        reason,
      });
      await logSecurityEvent({
        type: "view_limit_override_set",
        severity: "high",
        actorUserId: u.id,
        orgId: u.orgId ?? null,
        scope: "billing",
        message: "Owner view limit override set",
        meta: { ownerId, hours, reason },
      });
      await appendImmutableAudit({
        streamKey: `owner:${ownerId}`,
        action: "billing.view_limit_override_set",
        actorUserId: u.id,
        orgId: u.orgId ?? null,
        subjectId: ownerId,
        payload: { hours, reason },
      });
      return NextResponse.redirect(new URL("/admin/billing?saved=1", req.url), { status: 303 });
    }

    if (action === "clear") {
      await clearViewLimitOverride(ownerId);
      await logSecurityEvent({
        type: "view_limit_override_cleared",
        severity: "high",
        actorUserId: u.id,
        orgId: u.orgId ?? null,
        scope: "billing",
        message: "Owner view limit override cleared",
        meta: { ownerId, reason },
      });
      await appendImmutableAudit({
        streamKey: `owner:${ownerId}`,
        action: "billing.view_limit_override_cleared",
        actorUserId: u.id,
        orgId: u.orgId ?? null,
        subjectId: ownerId,
        payload: { reason },
      });
      return NextResponse.redirect(new URL("/admin/billing?saved=1", req.url), { status: 303 });
    }

    return NextResponse.redirect(new URL("/admin/billing?error=bad_action", req.url), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(new URL(`/admin/billing?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
  }
}
