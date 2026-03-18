export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { clientIpKey, logSecurityEvent, enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { createQuarantineOverride, revokeActiveQuarantineOverride } from "@/lib/quarantineOverride";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

type JsonBody = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ADMIN_ABUSE_BODY_BYTES = 32 * 1024;
const MAX_SHARE_TOKEN_LEN = 256;
const MAX_REASON_LEN = 500;
const MAX_NOTES_LEN = 2000;
const ALLOWED_ACTIONS = new Set(["disable_doc", "override_quarantine", "revoke_override", "revoke_share", "close_report"]);

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function norm(s: unknown): string {
  return String(s || "").replace(/[\r\n]+/g, " ").trim();
}

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

function bodyString(body: JsonBody, key: string): string {
  return norm(body[key]);
}
function bodyOptString(body: JsonBody, key: string, max: number): string | null {
  const v = body[key];
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]+/g, " ").trim();
  if (/[\0]/.test(s)) return null;
  return s ? s.slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_ADMIN_ABUSE_MS", 20_000);
  try {
    return await withRouteTimeout(
      (async () => {
        // Throttle admin abuse actions (safety)
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:admin_abuse_actions",
          limit: Number(process.env.RATE_LIMIT_ADMIN_ABUSE_PER_MIN || 120),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }
        let user;
        try {
          user = await requirePermission("abuse.manage");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "FORBIDDEN";
          const status = msg === "UNAUTHENTICATED" ? 401 : 403;
          return NextResponse.json({ ok: false, error: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" }, { status });
        }

        const ipInfo = clientIpKey(req);
        if (parseJsonBodyLength(req) > MAX_ADMIN_ABUSE_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }

        let rawBody: JsonBody;
        try {
          const parsed = await req.json();
          rawBody = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonBody) : ({} as JsonBody);
        } catch {
          return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
        }
        if (!rawBody || !Object.keys(rawBody).length) {
          return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
        }

        const act = bodyString(rawBody, "action");
        if (!ALLOWED_ACTIONS.has(act)) {
          return NextResponse.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });
        }
        const reason = bodyOptString(rawBody, "reason", MAX_REASON_LEN);

        if (act === "disable_doc") {
          const docId = bodyString(rawBody, "docId");
          if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC" }, { status: 400 });
          if (!isUuid(docId)) return NextResponse.json({ ok: false, error: "INVALID_DOC" }, { status: 400 });
          const appliedAction = "disable_doc";
          const normalizedReason = reason;

          await sql`
            update public.docs
            set
              moderation_status = 'disabled',
              disabled_at = now(),
              disabled_by = ${user.id}::uuid,
              disabled_reason = ${normalizedReason}
            where id = ${docId}::uuid
          `;

          if (rawBody.reportId) {
            const reportId = bodyString(rawBody, "reportId");
            if (reportId) {
              if (!isUuid(reportId)) return NextResponse.json({ ok: false, error: "INVALID_REPORT" }, { status: 400 });
              await sql`
                update public.abuse_reports
                set status = 'reviewing'
                where id = ${reportId}::uuid
              `;
            }
          }

          await logSecurityEvent({
            type: "doc_disabled",
            severity: "high",
            ip: ipInfo.ip,
            docId,
            scope: "admin_abuse",
            message: normalizedReason || "Admin moderation action",
          });
          await appendImmutableAudit({
            streamKey: `admin:${user.id}`,
            action: "admin.abuse_doc_action",
            actorUserId: user.id,
            orgId: user.orgId ?? null,
            docId,
            ipHash: ipInfo.ipHash,
            payload: { requestedAction: act, appliedAction, reason: normalizedReason, reportId: rawBody.reportId ?? null },
          });

          return NextResponse.json({ ok: true, action: appliedAction });
        }

        if (act === "override_quarantine") {
          const docId = bodyString(rawBody, "docId");
          const confirm = bodyString(rawBody, "confirm");
          const ttlMinutes = Number(rawBody.ttlMinutes ?? 30);
          if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC" }, { status: 400 });
          if (!isUuid(docId)) return NextResponse.json({ ok: false, error: "INVALID_DOC" }, { status: 400 });
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
          const docId = bodyString(rawBody, "docId");
          const confirm = bodyString(rawBody, "confirm");
          if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC" }, { status: 400 });
          if (!isUuid(docId)) return NextResponse.json({ ok: false, error: "INVALID_DOC" }, { status: 400 });
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
          const token = bodyString(rawBody, "token");
          if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
          if (token.length > MAX_SHARE_TOKEN_LEN || /[\r\n\0\s]/.test(token)) {
            return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 400 });
          }

          await sql`
            update public.share_tokens
            set revoked_at = now()
            where token = ${token}
          `;

          if (rawBody.reportId) {
            const reportId = bodyString(rawBody, "reportId");
            if (reportId) {
              if (!isUuid(reportId)) return NextResponse.json({ ok: false, error: "INVALID_REPORT" }, { status: 400 });
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
            payload: { tokenPrefix: token.slice(0, 12), reason, reportId: rawBody.reportId ?? null },
          });

          return NextResponse.json({ ok: true });
        }

        if (act === "close_report") {
          const reportId = bodyString(rawBody, "reportId");
          const notes = bodyOptString(rawBody, "notes", MAX_NOTES_LEN);
          if (!reportId) return NextResponse.json({ ok: false, error: "MISSING_REPORT" }, { status: 400 });
          if (!isUuid(reportId)) return NextResponse.json({ ok: false, error: "INVALID_REPORT" }, { status: 400 });

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
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
