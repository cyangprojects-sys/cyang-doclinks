// src/app/api/v1/takedown/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit, clientIpKey, logSecurityEvent } from "@/lib/securityTelemetry";
import { resolveShareMeta, resolveDoc } from "@/lib/resolveDoc";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

type Body = {
  token?: string | null;
  alias?: string | null;
  doc_id?: string | null;

  requester_name?: string | null;
  requester_email?: string | null;
  claimant_company?: string | null;

  message?: string | null;
  statement?: string | null;
  signature?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALIAS_RE = /^[a-z0-9][a-z0-9_-]{2,159}$/i;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TAKEDOWN_BODY_BYTES = 24 * 1024;
const MAX_TARGET_TOKEN_LEN = 256;
const MAX_TARGET_ALIAS_LEN = 160;
const MAX_DOC_ID_INPUT_LEN = 128;
const MAX_REQUESTER_FIELD_LEN = 256;
const MAX_MESSAGE_LEN = 8000;
const MAX_SIGNATURE_LEN = 512;

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function norm(s: unknown, max = 4000): string | null {
  const v = String(s ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!v) return null;
  if (/[\0]/.test(v)) return null;
  return v.length > max ? v.slice(0, max) : v;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

function parseToken(value: unknown): string | null {
  const token = norm(value, MAX_TARGET_TOKEN_LEN);
  if (!token) return null;
  return /[\s]/.test(token) ? null : token;
}

function parseAlias(value: unknown): string | null {
  const raw = norm(value, MAX_TARGET_ALIAS_LEN);
  if (!raw) return null;
  const alias = raw.toLowerCase();
  return ALIAS_RE.test(alias) ? alias : null;
}

function parseEmail(value: unknown): string | null {
  const email = norm(value, MAX_REQUESTER_FIELD_LEN)?.toLowerCase() ?? null;
  if (!email) return null;
  if (!BASIC_EMAIL_RE.test(email)) return null;
  return email;
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_API_V1_TAKEDOWN_MS", 20_000);
  try {
    return await withRouteTimeout(
      (async () => {
        if (parseJsonBodyLength(req) > MAX_TAKEDOWN_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }

        // Basic global throttle
        const globalRl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:api",
          limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
          windowSeconds: 60,
          strict: true,
        });
        if (!globalRl.ok) {
          return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
        }

        const ipInfo = clientIpKey(req);
        let body: Body | null = null;
        try {
          const parsed = await req.json();
          body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Body) : null;
        } catch {
          body = null;
        }
        if (!body) return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });

        const tokenRaw = String(body.token ?? "").trim();
        const token = parseToken(body.token);
        if (tokenRaw && !token) {
          return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 400 });
        }

        const aliasRaw = String(body.alias ?? "").trim();
        const alias = parseAlias(body.alias);
        if (aliasRaw && !alias) {
          return NextResponse.json({ ok: false, error: "INVALID_ALIAS" }, { status: 400 });
        }

        const docIdInput = norm(body.doc_id, MAX_DOC_ID_INPUT_LEN);
        if (docIdInput && !isUuid(docIdInput)) {
          return NextResponse.json({ ok: false, error: "INVALID_DOC_ID" }, { status: 400 });
        }

        const requesterName = norm(body.requester_name, MAX_REQUESTER_FIELD_LEN);
        const requesterEmailRaw = String(body.requester_email ?? "").trim();
        const requesterEmail = parseEmail(body.requester_email);
        if (requesterEmailRaw && !requesterEmail) {
          return NextResponse.json({ ok: false, error: "INVALID_REQUESTER_EMAIL" }, { status: 400 });
        }
        const claimantCompany = norm(body.claimant_company, MAX_REQUESTER_FIELD_LEN);

        const message = norm(body.message, MAX_MESSAGE_LEN);
        const statement = norm(body.statement, MAX_MESSAGE_LEN);
        const signature = norm(body.signature, MAX_SIGNATURE_LEN);

        if (!token && !alias && !docIdInput) {
          return NextResponse.json({ ok: false, error: "MISSING_TARGET" }, { status: 400 });
        }

        // Resolve to doc_id (best-effort). Prefer token -> alias -> explicit.
        let docId: string | null = null;
        let shareToken: string | null = token || null;

        try {
          if (token) {
            const meta = await resolveShareMeta(token);
            if (meta.ok) docId = meta.docId;
          } else if (alias) {
            const r = await resolveDoc({ alias });
            if (r.ok) docId = r.docId;
          } else if (docIdInput) {
            docId = docIdInput;
          }
        } catch {
          // ignore resolution errors; we still store notice
        }
        if (docId && !isUuid(docId)) {
          docId = null;
        }

        const rows = (await sql`
          insert into public.dmca_notices (
            doc_id, share_token,
            requester_name, requester_email, claimant_company,
            message, statement, signature,
            ip_hash, user_agent
          )
          values (
            ${docId ? sql`${docId}::uuid` : sql`null`},
            ${shareToken},
            ${requesterName}, ${requesterEmail}, ${claimantCompany},
            ${message}, ${statement}, ${signature},
            ${ipInfo.ipHash},
            ${req.headers.get("user-agent") || ""}
          )
          returning id::text as id
        `) as unknown as Array<{ id: string }>;

        const noticeId = rows?.[0]?.id ?? null;

        // Put doc into disabled pending review (if we could resolve it).
        // Manual quarantine is deprecated; quarantine should come from high-risk scan policy only.
        if (docId) {
          await sql`
            update public.docs
            set
              dmca_status = 'pending',
              dmca_last_notice_id = ${noticeId ? sql`${noticeId}::uuid` : sql`null`},
              moderation_status = 'disabled',
              disabled_at = now(),
              disabled_reason = coalesce(disabled_reason, 'dmca:pending')
            where id = ${docId}::uuid
          `;
        }

        await logSecurityEvent({
          type: "dmca_notice_submitted",
          severity: "medium",
          ip: ipInfo.ip,
          docId: docId || undefined,
          scope: "dmca",
          message: "DMCA/takedown notice submitted",
          meta: { noticeId, hasDocId: !!docId, hasToken: !!token, hasAlias: !!alias },
        });

        return NextResponse.json({ ok: true, id: noticeId });
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
