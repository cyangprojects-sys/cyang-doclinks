// src/app/api/v1/takedown/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit, clientIpKey, logSecurityEvent } from "@/lib/securityTelemetry";
import { resolveShareMeta, resolveDoc } from "@/lib/resolveDoc";

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

function norm(s: unknown, max = 4000): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

export async function POST(req: NextRequest) {
  // Basic global throttle
  const globalRl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:api",
    limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
    windowSeconds: 60,
  });
  if (!globalRl.ok) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }

  const ipInfo = clientIpKey(req);
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });

  const token = norm(body.token, 256);
  const alias = norm(body.alias, 256)?.toLowerCase() ?? null;
  const docIdInput = norm(body.doc_id, 128);

  const requesterName = norm(body.requester_name, 256);
  const requesterEmail = norm(body.requester_email, 256)?.toLowerCase() ?? null;
  const claimantCompany = norm(body.claimant_company, 256);

  const message = norm(body.message, 8000);
  const statement = norm(body.statement, 8000);
  const signature = norm(body.signature, 512);

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

  // Put doc into quarantine while pending review (if we could resolve it).
  if (docId) {
    await sql`
      update public.docs
      set
        dmca_status = 'pending',
        dmca_last_notice_id = ${noticeId ? sql`${noticeId}::uuid` : sql`null`},
        moderation_status = 'quarantined',
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
}
