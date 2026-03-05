import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_SECURITY_TENANT_FREEZE_BODY_BYTES = 8 * 1024;

function asBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseJsonBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
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
  let appBaseUrl: string;
  const ct = String(req.headers.get("content-type") || "").toLowerCase();
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }

  try {
    if (parseJsonBodyLength(req) > MAX_SECURITY_TENANT_FREEZE_BODY_BYTES) {
      if (ct.includes("application/json")) {
        return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      }
      return NextResponse.redirect(new URL("/admin/security?error=PAYLOAD_TOO_LARGE", appBaseUrl), { status: 303 });
    }
    const user = await requireRole("owner");
    if (!user.orgId) {
      return NextResponse.json({ ok: false, error: "ORG_REQUIRED" }, { status: 400 });
    }

    let freeze = false;
    if (ct.includes("application/json")) {
      const parsed = await req.json().catch(() => null);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
      }
      const json = parsed as { freeze?: unknown };
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
      new URL(`/admin/security?saved=${freeze ? "tenant_frozen" : "tenant_unfrozen"}`, appBaseUrl),
      { status: 303 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    const safeError = status === 403 ? "FORBIDDEN" : "SERVER_ERROR";
    if (String(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, error: safeError }, { status });
    }
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(safeError)}`, appBaseUrl), {
      status: 303,
    });
  }
}
