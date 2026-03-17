export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { withRequestTelemetry } from "@/lib/perfTelemetry";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALIAS_RE = /^[a-z0-9][a-z0-9_-]{2,159}$/i;
const DOCS_LIMIT_DEFAULT = 200;
const DOCS_LIMIT_MAX = 500;
const API_V1_DOCS_TIMEOUT_MS = getRouteTimeoutMs("API_V1_DOCS_TIMEOUT_MS", 15_000);

function parseDocsLimit(req: NextRequest): number {
  const raw = String(req.nextUrl.searchParams.get("limit") || "").trim();
  if (!raw || raw.length > 8 || /[\r\n\0]/.test(raw)) return DOCS_LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DOCS_LIMIT_DEFAULT;
  return Math.max(1, Math.min(DOCS_LIMIT_MAX, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  try {
    return await withRequestTelemetry(
      req,
      async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:api",
          limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }

        const auth = await verifyApiKeyFromRequest(req);
        if (!auth.ok) {
          return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
        }
        if (!UUID_RE.test(auth.ownerId)) {
          return NextResponse.json({ ok: false, error: "INVALID_API_KEY" }, { status: 401 });
        }

        const limit = parseDocsLimit(req);
        const rows = await withRouteTimeout(
          (sql`
        select
          d.id::text as id,
          d.title::text as title,
          d.created_at::text as created_at,
          (
            select a.alias::text
            from public.doc_aliases a
            where a.doc_id = d.id
            order by a.created_at desc nulls last
            limit 1
          ) as alias
        from public.docs d
        where d.owner_id = ${auth.ownerId}::uuid
        order by d.created_at desc
        limit ${limit}
      ` as unknown as Promise<Array<{ id: string; title: string | null; created_at: string; alias: string | null }>>),
          API_V1_DOCS_TIMEOUT_MS
        );

        const docs = rows.map((row) => {
          const safeId = UUID_RE.test(String(row.id || "").trim()) ? String(row.id).trim() : "";
          const safeTitle = String(row.title || "").replace(/[\r\n\0]+/g, " ").trim().slice(0, 500);
          const aliasRaw = String(row.alias || "").trim().toLowerCase();
          const safeAlias = ALIAS_RE.test(aliasRaw) ? aliasRaw : null;
          return {
            id: safeId,
            title: safeTitle || null,
            created_at: String(row.created_at || ""),
            alias: safeAlias,
          };
        }).filter((row) => Boolean(row.id));

        return NextResponse.json({ ok: true, docs });
      },
      { routeKey: "/api/v1/docs" }
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
