// src/app/api/admin/dmca/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { clientIpKey, enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";

type Action =
  | { action: "set_status"; noticeId: string; status: "new" | "reviewing" | "accepted" | "rejected" | "actioned"; adminNotes?: string | null }
  | { action: "takedown_doc"; noticeId: string; docId: string; reason?: string | null; confirm?: string | null }
  | { action: "restore_doc"; noticeId: string; docId: string; reason?: string | null; confirm?: string | null };

type JsonBody = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DMCA_BODY_BYTES = 24 * 1024;
const MAX_NOTES_LEN = 4000;
const MAX_REASON_LEN = 4000;
const ALLOWED_DMCA_STATUS = new Set(["new", "reviewing", "accepted", "rejected", "actioned"]);

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

function bodyString(body: JsonBody, key: string): string {
  return String(body[key] || "").trim();
}

function bodyOptText(body: JsonBody, key: string, maxLen: number): string | null {
  const value = body[key];
  if (value == null) return null;
  const out = String(value).replace(/[\r\n]+/g, " ").trim();
  if (!out || /[\0]/.test(out)) return null;
  return out.slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("dmca.manage");

    const globalRl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:api",
      limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
      windowSeconds: 60,
    });
    if (!globalRl.ok) return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
    if (parseJsonBodyLength(req) > MAX_DMCA_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const ipInfo = clientIpKey(req);

    let rawBody: JsonBody | null = null;
    try {
      const parsed = await req.json();
      rawBody = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonBody) : null;
    } catch {
      rawBody = null;
    }
    if (!rawBody) return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });

    const action = bodyString(rawBody, "action");
    const noticeId = bodyString(rawBody, "noticeId");
    if (!noticeId || !isUuid(noticeId)) {
      return NextResponse.json({ ok: false, error: "INVALID_NOTICE_ID" }, { status: 400 });
    }

    if (action === "set_status") {
      const status = bodyString(rawBody, "status");
      if (!ALLOWED_DMCA_STATUS.has(status)) {
        return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
      }
      const adminNotes = bodyOptText(rawBody, "adminNotes", MAX_NOTES_LEN);
      await sql`
        update public.dmca_notices
        set
          status = ${status}::text,
          admin_notes = coalesce(${adminNotes}, admin_notes)
        where id = ${noticeId}::uuid
      `;
      await appendImmutableAudit({
        streamKey: `dmca:${noticeId}`,
        action: "admin.dmca_set_status",
        actorUserId: user.id,
        orgId: user.orgId ?? null,
        ipHash: ipInfo.ipHash,
        payload: { status, adminNotes },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "takedown_doc") {
      const docId = bodyString(rawBody, "docId");
      if (!docId || !isUuid(docId)) {
        return NextResponse.json({ ok: false, error: "INVALID_DOC_ID" }, { status: 400 });
      }
      const expected = `TAKEDOWN ${docId}`;
      if (bodyString(rawBody, "confirm") !== expected) {
        return NextResponse.json(
          { ok: false, error: "CONFIRMATION_REQUIRED", message: `confirm must equal "${expected}"` },
          { status: 400 }
        );
      }
      const reason = bodyOptText(rawBody, "reason", MAX_REASON_LEN) || "dmca:takedown";

      await sql`
        update public.docs
        set
          moderation_status = 'disabled',
          disabled_at = now(),
          disabled_reason = ${reason},
          dmca_status = 'takedown',
          dmca_takedown_at = now(),
          dmca_takedown_reason = ${reason}
        where id = ${docId}::uuid
      `;

      await sql`
        update public.dmca_notices
        set
          status = 'actioned',
          action = 'disable',
          actioned_at = now()
        where id = ${noticeId}::uuid
      `;

      await logSecurityEvent({
        type: "dmca_takedown_actioned",
        severity: "high",
        ip: ipInfo.ip,
        docId,
        scope: "dmca",
        message: "Owner actioned DMCA takedown: disabled doc",
        meta: { noticeId, reason },
      });
      await appendImmutableAudit({
        streamKey: `doc:${docId}`,
        action: "admin.dmca_takedown",
        actorUserId: user.id,
        orgId: user.orgId ?? null,
        docId,
        ipHash: ipInfo.ipHash,
        payload: { noticeId, reason },
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "restore_doc") {
      const docId = bodyString(rawBody, "docId");
      if (!docId || !isUuid(docId)) {
        return NextResponse.json({ ok: false, error: "INVALID_DOC_ID" }, { status: 400 });
      }
      const expected = `RESTORE ${docId}`;
      if (bodyString(rawBody, "confirm") !== expected) {
        return NextResponse.json(
          { ok: false, error: "CONFIRMATION_REQUIRED", message: `confirm must equal "${expected}"` },
          { status: 400 }
        );
      }
      const reason = bodyOptText(rawBody, "reason", MAX_REASON_LEN) || "dmca:restored";

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
        where id = ${docId}::uuid
      `;

      await sql`
        update public.dmca_notices
        set
          status = 'actioned',
          action = 'none',
          actioned_at = now()
        where id = ${noticeId}::uuid
      `;

      await logSecurityEvent({
        type: "dmca_restored_actioned",
        severity: "medium",
        ip: ipInfo.ip,
        docId,
        scope: "dmca",
        message: "Owner restored doc after DMCA review",
        meta: { noticeId, reason },
      });
      await appendImmutableAudit({
        streamKey: `doc:${docId}`,
        action: "admin.dmca_restore",
        actorUserId: user.id,
        orgId: user.orgId ?? null,
        docId,
        ipHash: ipInfo.ipHash,
        payload: { noticeId, reason },
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", message: "Unable to process DMCA action." }, { status: 500 });
  }
}
