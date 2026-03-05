import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { getSecurityFreezeSettings, setSecurityFreezeSettings } from "@/lib/settings";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_SECURITY_FREEZE_BODY_BYTES = 8 * 1024;

function asBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseJsonBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
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
  let appBaseUrl: string;
  const ct = String(req.headers.get("content-type") || "").toLowerCase();
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }

  try {
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:admin_security_freeze",
      limit: Number(process.env.RATE_LIMIT_ADMIN_SECURITY_FREEZE_PER_MIN || 60),
      windowSeconds: 60,
      strict: true,
    });
    if (!rl.ok) {
      if (ct.includes("application/json")) {
        return NextResponse.json(
          { ok: false, error: "RATE_LIMIT" },
          { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        );
      }
      return NextResponse.redirect(new URL("/admin/security?error=RATE_LIMIT", appBaseUrl), { status: 303 });
    }
    if (parseJsonBodyLength(req) > MAX_SECURITY_FREEZE_BODY_BYTES) {
      if (ct.includes("application/json")) {
        return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      }
      return NextResponse.redirect(new URL("/admin/security?error=PAYLOAD_TOO_LARGE", appBaseUrl), { status: 303 });
    }
    const user = await requireRole("owner");

    let payload: Record<string, unknown> = {};
    if (ct.includes("application/json")) {
      const parsed = await req.json().catch(() => null);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
      }
      payload = parsed as Record<string, unknown>;
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
        new URL(`/admin/security?error=${encodeURIComponent(saved.error)}`, appBaseUrl),
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
    return NextResponse.redirect(new URL("/admin/security?saved=freeze", appBaseUrl), { status: 303 });
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
