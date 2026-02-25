export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";
import { clientIpKey, logSecurityEvent, enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

type Action =
  | { action: "disable_doc"; docId: string; reason?: string | null; reportId?: string | null }
  | { action: "quarantine_doc"; docId: string; reason?: string | null; reportId?: string | null }
  | { action: "revoke_share"; token: string; reason?: string | null; reportId?: string | null }
  | { action: "close_report"; reportId: string; notes?: string | null };

function norm(s: any): string {
  return String(s || "").trim();
}

export async function POST(req: NextRequest) {
  // Owner auth
  const owner = await requireOwner();
  if (!owner.ok) return NextResponse.json({ ok: false, error: owner.reason }, { status: owner.reason === "FORBIDDEN" ? 403 : 401 });

  const ipInfo = clientIpKey(req);

  // Throttle admin abuse actions (safety)
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_abuse_actions",
    limit: Number(process.env.RATE_LIMIT_ADMIN_ABUSE_PER_MIN || 120),
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: Action;
  try {
    body = (await req.json()) as Action;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }

  const act = (body as any)?.action;
  const reason = (body as any)?.reason ? String((body as any).reason).slice(0, 500) : null;

  if (act === "disable_doc" || act === "quarantine_doc") {
    const docId = norm((body as any).docId);
    if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC" }, { status: 400 });

    await sql`
      update public.docs
      set
        moderation_status = ${act === "disable_doc" ? "disabled" : "quarantined"},
        scan_status = ${act === "quarantine_doc" ? "quarantined" : sql`scan_status`},
        disabled_at = now(),
        disabled_by = ${owner.user.id}::uuid,
        disabled_reason = ${reason}
      where id = ${docId}::uuid
    `;

    if ((body as any).reportId) {
      const reportId = norm((body as any).reportId);
      if (reportId) {
        await sql`
          update public.abuse_reports
          set status = 'reviewing'
          where id = ${reportId}::uuid
        `;
      }
    }

    await logSecurityEvent({
      type: act === "disable_doc" ? "doc_disabled" : "doc_quarantined",
      severity: "high",
      ip: ipInfo.ip,
      docId,
      scope: "admin_abuse",
      message: reason || "Admin moderation action",
    });

    return NextResponse.json({ ok: true });
  }

  if (act === "revoke_share") {
    const token = norm((body as any).token);
    if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

    await sql`
      update public.share_tokens
      set revoked_at = now()
      where token = ${token}
    `;

    if ((body as any).reportId) {
      const reportId = norm((body as any).reportId);
      if (reportId) {
        await sql`
          update public.abuse_reports
          set status = 'reviewing'
          where id = ${reportId}::uuid
        `;
      }
    }

    await logSecurityEvent({
      type: "share_revoked",
      severity: "medium",
      ip: ipInfo.ip,
      scope: "admin_abuse",
      message: reason || "Share revoked via abuse workflow",
      meta: { token: token.slice(0, 12) },
    });

    return NextResponse.json({ ok: true });
  }

  if (act === "close_report") {
    const reportId = norm((body as any).reportId);
    const notes = (body as any).notes ? String((body as any).notes).slice(0, 2000) : null;
    if (!reportId) return NextResponse.json({ ok: false, error: "MISSING_REPORT" }, { status: 400 });

    await sql`
      update public.abuse_reports
      set
        status = 'closed',
        admin_notes = ${notes},
        closed_at = now(),
        closed_by = ${owner.user.id}::uuid
      where id = ${reportId}::uuid
    `;

    await logSecurityEvent({
      type: "abuse_report_closed",
      severity: "low",
      ip: ipInfo.ip,
      scope: "admin_abuse",
      message: "Abuse report closed",
      meta: { reportId },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });
}
