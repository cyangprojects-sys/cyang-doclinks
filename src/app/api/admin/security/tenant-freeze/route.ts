import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

async function setOrgFreeze(orgId: string, freeze: boolean): Promise<void> {
  try {
    await sql`
      update public.organizations
      set
        disabled = ${freeze},
        is_active = ${!freeze}
      where id = ${orgId}::uuid
    `;
    return;
  } catch {
    // fall through for partial/older schemas
  }

  try {
    await sql`
      update public.organizations
      set disabled = ${freeze}
      where id = ${orgId}::uuid
    `;
    return;
  } catch {
    // fall through
  }

  await sql`
    update public.organizations
    set is_active = ${!freeze}
    where id = ${orgId}::uuid
  `;
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("owner");
    if (!user.orgId) {
      return NextResponse.json({ ok: false, error: "ORG_REQUIRED" }, { status: 400 });
    }

    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    let freeze = false;
    if (ct.includes("application/json")) {
      const json = ((await req.json().catch(() => null)) || {}) as { freeze?: unknown };
      freeze = asBool(json.freeze);
    } else {
      const form = await req.formData();
      freeze = asBool(form.get("freeze"));
    }

    await setOrgFreeze(user.orgId, freeze);

    await appendImmutableAudit({
      streamKey: "security:incident-controls",
      action: freeze ? "security.tenant.freeze" : "security.tenant.unfreeze",
      actorUserId: user.id,
      orgId: user.orgId,
      payload: {
        orgId: user.orgId,
        freeze,
      },
    });
    await logSecurityEvent({
      type: freeze ? "tenant_freeze_enabled" : "tenant_freeze_disabled",
      severity: "high",
      actorUserId: user.id,
      orgId: user.orgId,
      scope: "incident_response",
      message: freeze ? "Tenant serving frozen by owner" : "Tenant serving unfrozen by owner",
      meta: { freeze },
    });

    if (ct.includes("application/json")) {
      return NextResponse.json({ ok: true, freeze });
    }
    return NextResponse.redirect(
      new URL(`/admin/security?saved=${freeze ? "tenant_frozen" : "tenant_unfrozen"}`, req.url),
      { status: 303 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    if (String(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(msg)}`, req.url), {
      status: 303,
    });
  }
}
