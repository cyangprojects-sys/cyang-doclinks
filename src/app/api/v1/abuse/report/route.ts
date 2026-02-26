export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit, clientIpKey, logSecurityEvent, detectAbuseReportSpike } from "@/lib/securityTelemetry";
import { reportException } from "@/lib/observability";

type Body = {
  token?: string | null;
  alias?: string | null;
  reporter_email?: string | null;
  message?: string | null;
};

function normToken(s: string | null | undefined): string | null {
  const v = String(s || "").trim();
  return v ? v : null;
}

function normAlias(s: string | null | undefined): string | null {
  const v = decodeURIComponent(String(s || "")).trim().toLowerCase();
  return v ? v : null;
}

function normEmail(s: string | null | undefined): string | null {
  const v = String(s || "").trim().toLowerCase();
  return v ? v : null;
}

export async function POST(req: NextRequest) {
  try {
    const ipInfo = clientIpKey(req);

    // Rate limit: abuse report submission per IP
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:abuse_report",
      limit: Number(process.env.RATE_LIMIT_ABUSE_REPORT_IP_PER_MIN || 10),
      windowSeconds: 60,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT", message: "Too many reports. Try again later." },
        { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: "BAD_JSON", message: "Invalid JSON." }, { status: 400 });
    }

    const token = normToken(body.token);
    const alias = normAlias(body.alias);
    const reporterEmail = normEmail(body.reporter_email);
    const message = String(body.message || "").trim() || null;

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
  } catch (error: unknown) {
    await reportException({
      error,
      event: "abuse_report_route_error",
      context: { route: "/api/v1/abuse/report" },
    });
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
