export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { clearViewLimitOverride, setViewLimitOverride } from "@/lib/viewLimitOverride";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";
const MAX_BILLING_OVERRIDE_FORM_BYTES = 8 * 1024;

function parseFormBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

export async function POST(req: Request) {
  let appBaseUrl: string;
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_billing_view_override",
    limit: Number(process.env.RATE_LIMIT_ADMIN_BILLING_OVERRIDE_PER_MIN || 60),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.redirect(new URL("/admin/billing?error=RATE_LIMIT", appBaseUrl), { status: 303 });
  }

  try {
    const u = await requirePermission("billing.override");
    if (parseFormBodyLength(req) > MAX_BILLING_OVERRIDE_FORM_BYTES) {
      return NextResponse.redirect(new URL("/admin/billing?error=PAYLOAD_TOO_LARGE", appBaseUrl), { status: 303 });
    }

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
      return NextResponse.redirect(new URL("/admin/billing?saved=1", appBaseUrl), { status: 303 });
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
      return NextResponse.redirect(new URL("/admin/billing?saved=1", appBaseUrl), { status: 303 });
    }

    return NextResponse.redirect(new URL("/admin/billing?error=bad_action", appBaseUrl), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const safeError = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? "FORBIDDEN" : "SERVER_ERROR";
    return NextResponse.redirect(new URL(`/admin/billing?error=${encodeURIComponent(safeError)}`, appBaseUrl), { status: 303 });
  }
}
