export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit, clientIpKey, logSecurityEvent, detectAbuseReportSpike } from "@/lib/securityTelemetry";
import { reportException } from "@/lib/observability";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

type Body = {
  token?: string | null;
  alias?: string | null;
  reporter_email?: string | null;
  message?: string | null;
};

const MAX_ABUSE_REPORT_BODY_BYTES = 16 * 1024;
const MAX_TOKEN_LEN = 256;
const MAX_ALIAS_LEN = 160;
const MAX_REPORT_EMAIL_LEN = 320;
const MAX_REPORT_MESSAGE_LEN = 4000;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function normToken(s: string | null | undefined): string | null {
  const v = String(s || "").trim();
  if (!v || v.length > MAX_TOKEN_LEN || /[\r\n\0]/.test(v)) return null;
  return v ? v : null;
}

function normAlias(s: string | null | undefined): string | null {
  const raw = String(s || "").trim();
  if (!raw || raw.length > MAX_ALIAS_LEN || /[\r\n\0]/.test(raw)) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return "";
    }
  })();
  const v = decoded.trim().toLowerCase();
  return v ? v : null;
}

function normEmail(s: string | null | undefined): string | null {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return null;
  if (v.length > MAX_REPORT_EMAIL_LEN || /[\r\n\0]/.test(v)) return null;
  if (!BASIC_EMAIL_RE.test(v)) return null;
  return v ? v : null;
}

export async function POST(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_API_V1_ABUSE_REPORT_MS", 15_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const ipInfo = clientIpKey(req);

        // Rate limit: abuse report submission per IP
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:abuse_report",
          limit: Number(process.env.RATE_LIMIT_ABUSE_REPORT_IP_PER_MIN || 10),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT", message: "Too many reports. Try again later." },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }
        if (parseJsonBodyLength(req) > MAX_ABUSE_REPORT_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }

        let body: Body | null;
        try {
          const parsed = await req.json();
          body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Body) : null;
        } catch {
          return NextResponse.json({ ok: false, error: "BAD_JSON", message: "Invalid JSON." }, { status: 400 });
        }
        if (!body) {
          return NextResponse.json({ ok: false, error: "BAD_JSON", message: "Invalid JSON." }, { status: 400 });
        }

        const token = normToken(body.token);
        const alias = normAlias(body.alias);
        const reporterEmail = normEmail(body.reporter_email);
        const message = (() => {
          const text = String(body.message || "").replace(/[\r\n]+/g, " ").trim();
          if (!text || /[\0]/.test(text)) return null;
          return text.slice(0, MAX_REPORT_MESSAGE_LEN);
        })();

        if (!token && !alias) {
          return NextResponse.json({ ok: false, error: "MISSING_TARGET", message: "Missing token or alias." }, { status: 400 });
        }

        // Resolve doc_id best-effort.
        let docId: string | null = null;
        if (token) {
          const rows = (await sql`
          select doc_id::text as doc_id
          from public.share_tokens
          where token = ${token}
          limit 1
        `) as unknown as Array<{ doc_id: string }>;
          docId = rows?.[0]?.doc_id ?? null;
        } else if (alias) {
          // Try newer table name first, then legacy.
          try {
            const rows = (await sql`
            select doc_id::text as doc_id
            from public.document_aliases
            where alias = ${alias}
            limit 1
          `) as unknown as Array<{ doc_id: string }>;
            docId = rows?.[0]?.doc_id ?? null;
          } catch {
            const rows = (await sql`
            select doc_id::text as doc_id
            from public.doc_aliases
            where alias = ${alias}
            limit 1
          `) as unknown as Array<{ doc_id: string }>;
            docId = rows?.[0]?.doc_id ?? null;
          }
        }

        // Store report even if docId can't be resolved (token/alias may be unknown/expired).
        await sql`
        insert into public.abuse_reports (share_token, doc_id, reporter_email, message, ip_hash, user_agent)
        values (${token}, ${docId ? sql`${docId}::uuid` : sql`null`}, ${reporterEmail}, ${message}, ${ipInfo.ipHash}, ${req.headers.get("user-agent") || ""})
      `;

        await logSecurityEvent({
          type: "abuse_report_submitted",
          severity: "medium",
          ip: ipInfo.ip,
          docId: docId || undefined,
          scope: "abuse_report",
          message: "Viewer submitted an abuse report",
          meta: { token: token ? token.slice(0, 12) : null, alias: alias ?? null },
        });
        await detectAbuseReportSpike({ ip: ipInfo.ip });

        return NextResponse.json({ ok: true });
      })(),
      timeoutMs
    );
  } catch (error: unknown) {
    if (isRouteTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    await reportException({
      error,
      event: "abuse_report_route_error",
      context: { route: "/api/v1/abuse/report" },
    });
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
