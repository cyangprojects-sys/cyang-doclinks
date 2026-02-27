import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { getSecurityFreezeSettings, setSecurityFreezeSettings } from "@/lib/settings";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export async function GET() {
  try {
    await requireRole("owner");
    const result = await getSecurityFreezeSettings();
    return NextResponse.json({ ok: true, settings: result.settings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: status === 403 ? "FORBIDDEN" : "SERVER_ERROR" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("owner");
    const ct = String(req.headers.get("content-type") || "").toLowerCase();

    let payload: Record<string, unknown> = {};
    if (ct.includes("application/json")) {
      payload = ((await req.json().catch(() => null)) || {}) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      payload = {
        globalServeDisabled: form.get("globalServeDisabled"),
        shareServeDisabled: form.get("shareServeDisabled"),
        aliasServeDisabled: form.get("aliasServeDisabled"),
        ticketServeDisabled: form.get("ticketServeDisabled"),
      };
    }

    const next = {
      globalServeDisabled: asBool(payload.globalServeDisabled),
      shareServeDisabled: asBool(payload.shareServeDisabled),
      aliasServeDisabled: asBool(payload.aliasServeDisabled),
      ticketServeDisabled: asBool(payload.ticketServeDisabled),
    };

    const saved = await setSecurityFreezeSettings(next);
    if (!saved.ok) {
      if (ct.includes("application/json")) {
        return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
      }
      return NextResponse.redirect(
        new URL(`/admin/security?error=${encodeURIComponent(saved.error)}`, req.url),
        { status: 303 }
      );
    }

    await appendImmutableAudit({
      streamKey: "security:incident-controls",
      action: "security.freeze.update",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      payload: saved.settings,
    });
    await logSecurityEvent({
      type: "security_freeze_updated",
      severity: "high",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      scope: "incident_response",
      message: "Emergency freeze settings updated",
      meta: saved.settings,
    });

    if (ct.includes("application/json")) {
      return NextResponse.json({ ok: true, settings: saved.settings });
    }
    return NextResponse.redirect(new URL("/admin/security?saved=freeze", req.url), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    const safeError = status === 403 ? "FORBIDDEN" : "SERVER_ERROR";
    if (String(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, error: safeError }, { status });
    }
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(safeError)}`, req.url), {
      status: 303,
    });
  }
}
