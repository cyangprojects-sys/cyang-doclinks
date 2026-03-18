import { NextRequest, NextResponse } from "next/server";
import { requireUser, roleAtLeast } from "@/lib/authz";
import { sql } from "@/lib/db";
import { toDocumentStatusCollection } from "@/lib/documentTransientState";
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

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:viewer_docs_status",
      limit: Number(process.env.RATE_LIMIT_VIEWER_DOCS_STATUS_PER_MIN || 90),
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
    if (!docIds.length) {
      return NextResponse.json({
        ok: true,
        docs: [],
        collection_signature: "",
        has_active_docs: false,
        missing_doc_ids: [],
      });
    }

    const canSeeAll = roleAtLeast(user.role, "admin");
    let rows: Array<{
      doc_id: string;
      doc_state: string;
      scan_state: string;
      moderation_status: string;
    }> = [];

    const baseSelect = sql`
      select
        d.id::text as doc_id,
        coalesce(d.status::text, 'ready') as doc_state,
        coalesce(d.scan_status::text, 'unscanned') as scan_state,
        coalesce(d.moderation_status::text, 'active') as moderation_status
      from public.docs d
      where d.id = any(${docIds}::uuid[])
        and lower(coalesce(d.status::text, 'ready')) <> 'deleted'
    `;

    if (canSeeAll) {
      if (user.orgId) {
        try {
          rows = (await sql`
            ${baseSelect}
              and d.org_id = ${user.orgId}::uuid
            order by d.id asc
          `) as typeof rows;
        } catch {
          rows = (await sql`
            ${baseSelect}
            order by d.id asc
          `) as typeof rows;
        }
      } else {
        rows = (await sql`
          ${baseSelect}
          order by d.id asc
        `) as typeof rows;
      }
    } else {
      try {
        rows = (await sql`
          ${baseSelect}
            and (d.owner_id = ${user.id}::uuid or (d.owner_id is null and lower(coalesce(d.created_by_email,'')) = lower(${user.email})))
            ${user.orgId ? sql`and d.org_id = ${user.orgId}::uuid` : sql``}
          order by d.id asc
        `) as typeof rows;
      } catch {
        try {
          rows = (await sql`
            ${baseSelect}
              and d.owner_id = ${user.id}::uuid
            order by d.id asc
          `) as typeof rows;
        } catch {
          try {
            rows = (await sql`
              ${baseSelect}
                and lower(coalesce(d.created_by_email,'')) = lower(${user.email})
              order by d.id asc
            `) as typeof rows;
          } catch {
            rows = [];
          }
        }
      }
    }

    const collection = toDocumentStatusCollection(rows);
    const returnedDocIds = new Set(collection.docs.map((doc) => doc.doc_id));
    const missing_doc_ids = docIds.filter((docId) => !returnedDocIds.has(docId));

    return NextResponse.json({
      ok: true,
      ...collection,
      missing_doc_ids,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    return authErrorResponse(msg);
  }
}
