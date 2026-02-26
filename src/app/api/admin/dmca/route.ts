// src/app/api/admin/dmca/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";

type Action =
  | { action: "set_status"; noticeId: string; status: "new" | "reviewing" | "accepted" | "rejected" | "actioned"; adminNotes?: string | null }
  | { action: "takedown_doc"; noticeId: string; docId: string; reason?: string | null; confirm?: string | null }
  | { action: "restore_doc"; noticeId: string; docId: string; reason?: string | null; confirm?: string | null };

export async function POST(req: NextRequest) {
  try {
    await requireOwner();

    const globalRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:api",
      limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
      windowSeconds: 60,
    });
    if (!globalRl.ok) return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });

    const ipInfo = clientIpKey(req);

    const body = (await req.json().catch(() => null)) as Action | null;
    if (!body) return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });

    if (body.action === "set_status") {
      await sql`
        update public.dmca_notices
        set
          status = ${body.status}::text,
          admin_notes = coalesce(${body.adminNotes ?? null}, admin_notes)
        where id = ${body.noticeId}::uuid
      `;
      await appendImmutableAudit({
        streamKey: `dmca:${body.noticeId}`,
        action: "admin.dmca_set_status",
        ipHash: ipInfo.ipHash,
        payload: { status: body.status, adminNotes: body.adminNotes ?? null },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "takedown_doc") {
      const expected = `TAKEDOWN ${body.docId}`;
      if ((body.confirm || "").trim() !== expected) {
        return NextResponse.json(
          { ok: false, error: "CONFIRMATION_REQUIRED", message: `confirm must equal "${expected}"` },
          { status: 400 }
        );
      }
      const reason = String(body.reason || "dmca:takedown").slice(0, 4000);

      await sql`
        update public.docs
        set
          moderation_status = 'disabled',
          disabled_at = now(),
          disabled_reason = ${reason},
          dmca_status = 'takedown',
          dmca_takedown_at = now(),
          dmca_takedown_reason = ${reason}
        where id = ${body.docId}::uuid
      `;

      await sql`
        update public.dmca_notices
        set
          status = 'actioned',
          action = 'disable',
          actioned_at = now()
        where id = ${body.noticeId}::uuid
      `;

      await logSecurityEvent({
        type: "dmca_takedown_actioned",
        severity: "high",
        ip: ipInfo.ip,
        docId: body.docId,
        scope: "dmca",
        message: "Owner actioned DMCA takedown: disabled doc",
        meta: { noticeId: body.noticeId, reason },
      });
      await appendImmutableAudit({
        streamKey: `doc:${body.docId}`,
        action: "admin.dmca_takedown",
        docId: body.docId,
        ipHash: ipInfo.ipHash,
        payload: { noticeId: body.noticeId, reason },
      });

      return NextResponse.json({ ok: true });
    }

    if (body.action === "restore_doc") {
      const expected = `RESTORE ${body.docId}`;
      if ((body.confirm || "").trim() !== expected) {
        return NextResponse.json(
          { ok: false, error: "CONFIRMATION_REQUIRED", message: `confirm must equal "${expected}"` },
          { status: 400 }
        );
      }
      const reason = String(body.reason || "dmca:restored").slice(0, 4000);

      // Only restore if doc isn't high-risk; trigger will quarantine if risk_level=high.
      await sql`
        update public.docs
        set
          dmca_status = 'restored',
          dmca_takedown_reason = ${reason},
          moderation_status = case
            when lower(coalesce(risk_level,'low')) = 'high' then 'quarantined'
            else 'active'
          end,
          disabled_at = null,
          disabled_by = null,
          disabled_reason = null
        where id = ${body.docId}::uuid
      `;

      await sql`
        update public.dmca_notices
        set
          status = 'actioned',
          action = 'none',
          actioned_at = now()
        where id = ${body.noticeId}::uuid
      `;

      await logSecurityEvent({
        type: "dmca_restored_actioned",
        severity: "medium",
        ip: ipInfo.ip,
        docId: body.docId,
        scope: "dmca",
        message: "Owner restored doc after DMCA review",
        meta: { noticeId: body.noticeId, reason },
      });
      await appendImmutableAudit({
        streamKey: `doc:${body.docId}`,
        action: "admin.dmca_restore",
        docId: body.docId,
        ipHash: ipInfo.ipHash,
        payload: { noticeId: body.noticeId, reason },
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", message: String(e?.message || e) }, { status: 500 });
  }
}
