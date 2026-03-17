import { NextRequest, NextResponse } from "next/server";
import { requireUser, roleAtLeast } from "@/lib/authz";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 12 * 1024;
const MAX_DOC_IDS = 100;

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function normalizeDocIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    const id = String(raw || "").trim().toLowerCase();
    if (!id || !UUID_RE.test(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= MAX_DOC_IDS) break;
  }
  return out;
}

function authErrorResponse(message: string): NextResponse {
  if (message === "FORBIDDEN") return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  if (message === "UNAUTHENTICATED" || message === "MFA_REQUIRED") {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
}

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${table}
        and column_name = ${column}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:admin_upload_status",
      limit: Number(process.env.RATE_LIMIT_ADMIN_UPLOAD_ROUTE_PER_MIN || 60),
      windowSeconds: 60,
      strict: true,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    if (parseJsonBodyLength(req) > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { docIds?: unknown };
    const docIds = normalizeDocIds(body.docIds);
    if (!docIds.length) return NextResponse.json({ ok: true, docs: [] });

    const canSeeAll = roleAtLeast(user.role, "admin");
    const hasOwnerId = await columnExists("docs", "owner_id");
    const hasCreatedByEmail = await columnExists("docs", "created_by_email");
    const hasOrgId = await columnExists("docs", "org_id");

    const orgFilter = hasOrgId && user.orgId ? sql`and d.org_id = ${user.orgId}::uuid` : sql``;
    const ownerFilter = !canSeeAll
      ? hasOwnerId
        ? hasCreatedByEmail
          ? sql`and (d.owner_id = ${user.id}::uuid or (d.owner_id is null and lower(coalesce(d.created_by_email,'')) = lower(${user.email})))`
          : sql`and d.owner_id = ${user.id}::uuid`
        : hasCreatedByEmail
          ? sql`and lower(coalesce(d.created_by_email,'')) = lower(${user.email})`
          : sql``
      : sql``;

    const rows = (await sql`
      select
        d.id::text as doc_id,
        coalesce(d.status::text, 'ready') as doc_state,
        coalesce(d.scan_status::text, 'unscanned') as scan_state,
        coalesce(d.moderation_status::text, 'active') as moderation_status
      from public.docs d
      where d.id = any(${docIds}::uuid[])
        and lower(coalesce(d.status::text, 'ready')) <> 'deleted'
        ${ownerFilter}
        ${orgFilter}
      order by d.id asc
    `) as unknown as Array<{
      doc_id: string;
      doc_state: string;
      scan_state: string;
      moderation_status: string;
    }>;

    return NextResponse.json({ ok: true, docs: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    return authErrorResponse(msg);
  }
}
