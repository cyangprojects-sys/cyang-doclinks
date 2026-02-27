export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { clientIpKey, logSecurityEvent, enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { createQuarantineOverride, revokeActiveQuarantineOverride } from "@/lib/quarantineOverride";
import { appendImmutableAudit } from "@/lib/immutableAudit";

type Action =
  | { action: "disable_doc"; docId: string; reason?: string | null; reportId?: string | null }
  | { action: "quarantine_doc"; docId: string; reason?: string | null; reportId?: string | null }
  | { action: "override_quarantine"; docId: string; reason?: string | null; ttlMinutes?: number; confirm: string }
  | { action: "revoke_override"; docId: string; reason?: string | null; confirm: string }
  | { action: "revoke_share"; token: string; reason?: string | null; reportId?: string | null }
  | { action: "close_report"; reportId: string; notes?: string | null };

function norm(s: any): string {
  return String(s || "").trim();
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requirePermission("abuse.manage");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "FORBIDDEN";
    const status = msg === "UNAUTHENTICATED" ? 401 : 403;
    return NextResponse.json({ ok: false, error: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" }, { status });
  }

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
        disabled_by = ${user.id}::uuid,
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
    await appendImmutableAudit({
      streamKey: `admin:${user.id}`,
      action: "admin.abuse_doc_action",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      docId,
      ipHash: ipInfo.ipHash,
      payload: { action: act, reason, reportId: (body as any).reportId ?? null },
    });

    return NextResponse.json({ ok: true });
  }

  if (act === "override_quarantine") {
    const docId = norm((body as any).docId);
    const confirm = norm((body as any).confirm);
    const ttlMinutes = Number((body as any).ttlMinutes ?? 30);
    if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC" }, { status: 400 });
    if (confirm !== `OVERRIDE ${docId}`) {
      return NextResponse.json(
        { ok: false, error: "CONFIRMATION_REQUIRED", message: `confirm must equal "OVERRIDE ${docId}"` },
        { status: 400 }
      );
    }

    const created = await createQuarantineOverride({
      docId,
      actorUserId: user.id,
      reason,
      ttlMinutes,
    });
    if (!created) return NextResponse.json({ ok: false, error: "OVERRIDE_CREATE_FAILED" }, { status: 500 });

    await logSecurityEvent({
      type: "quarantine_override_granted",
      severity: "high",
      ip: ipInfo.ip,
      docId,
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      scope: "admin_abuse",
      message: reason || "Temporary quarantine override granted",
      meta: { overrideId: created.id, expiresAt: created.expires_at, ttlMinutes },
    });
    await appendImmutableAudit({
      streamKey: `doc:${docId}`,
      action: "doc.quarantine_override_granted",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      docId,
      ipHash: ipInfo.ipHash,
      payload: { reason, ttlMinutes, overrideId: created.id, expiresAt: created.expires_at },
    });

    return NextResponse.json({ ok: true, override_id: created.id, expires_at: created.expires_at });
  }

  if (act === "revoke_override") {
    const docId = norm((body as any).docId);
    const confirm = norm((body as any).confirm);
    if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC" }, { status: 400 });
    if (confirm !== `REVOKE_OVERRIDE ${docId}`) {
      return NextResponse.json(
        { ok: false, error: "CONFIRMATION_REQUIRED", message: `confirm must equal "REVOKE_OVERRIDE ${docId}"` },
        { status: 400 }
      );
    }

    const revoked = await revokeActiveQuarantineOverride({
      docId,
      actorUserId: user.id,
      reason,
    });
    await logSecurityEvent({
      type: "quarantine_override_revoked",
      severity: "high",
      ip: ipInfo.ip,
      docId,
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      scope: "admin_abuse",
      message: reason || "Quarantine override revoked",
      meta: { revoked },
    });
    await appendImmutableAudit({
      streamKey: `doc:${docId}`,
      action: "doc.quarantine_override_revoked",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      docId,
      ipHash: ipInfo.ipHash,
      payload: { reason, revoked },
    });
    return NextResponse.json({ ok: true, revoked });
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
    await appendImmutableAudit({
      streamKey: `admin:${user.id}`,
      action: "admin.abuse_revoke_share",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      ipHash: ipInfo.ipHash,
      payload: { tokenPrefix: token.slice(0, 12), reason, reportId: (body as any).reportId ?? null },
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
        closed_by = ${user.id}::uuid
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
    await appendImmutableAudit({
      streamKey: `admin:${user.id}`,
      action: "admin.abuse_close_report",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      ipHash: ipInfo.ipHash,
      payload: { reportId, notes },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });
}
