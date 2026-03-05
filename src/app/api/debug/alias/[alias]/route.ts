import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { isDebugApiEnabled } from "@/lib/debugAccess";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AliasLookupRow = {
  source_table: string;
  alias: string;
  doc_id: string;
  is_active: boolean | null;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

function normalizeAliasParam(rawAlias: string): string | null {
  let decoded = "";
  try {
    decoded = decodeURIComponent(rawAlias || "").trim().toLowerCase();
  } catch {
    return null;
  }
  if (!decoded) return "";
  if (!/^[a-z0-9_-]{3,80}$/.test(decoded)) return null;
  return decoded;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ alias: string }> }
) {
  if (!isDebugApiEnabled()) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:debug_alias_lookup",
    limit: Number(process.env.RATE_LIMIT_DEBUG_ALIAS_LOOKUP_PER_MIN || 60),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    await requireRole("owner");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const { alias: rawAlias } = await context.params;
  const alias = normalizeAliasParam(rawAlias || "");

  if (alias === "") {
    return NextResponse.json(
      { ok: false, error: "missing_alias" },
      { status: 400 }
    );
  }
  if (!alias) {
    return NextResponse.json({ ok: false, error: "INVALID_ALIAS" }, { status: 400 });
  }

  let rowDocAliases: AliasLookupRow[] = [];
  try {
    rowDocAliases = await sql`
    select
      'doc_aliases'::text as source_table,
      alias,
      doc_id::text as doc_id,
      is_active,
      revoked_at::text as revoked_at,
      expires_at::text as expires_at,
      created_at::text as created_at
    from public.doc_aliases
    where lower(alias) = ${alias}
    limit 1
  `;
  } catch {
    rowDocAliases = [];
  }

  let rowDocumentAliases: AliasLookupRow[] = [];
  try {
    rowDocumentAliases = await sql`
    select
      'document_aliases'::text as source_table,
      alias,
      doc_id::text as doc_id,
      null::bool as is_active,
      null::text as revoked_at,
      expires_at::text as expires_at,
      created_at::text as created_at
    from public.document_aliases
    where lower(alias) = ${alias}
    limit 1
  `;
  } catch {
    // table may not exist in some environments; ignore
    rowDocumentAliases = [];

  }

  const row = rowDocAliases?.[0] ?? rowDocumentAliases?.[0] ?? null;
  const expiresAt = row?.expires_at ? Date.parse(row.expires_at) : NaN;
  const expired = Number.isFinite(expiresAt) && expiresAt <= Date.now();

  return NextResponse.json({
    ok: true,
    alias,
    found: !!row,
    source_table: row?.source_table ?? null,
    state: row
      ? {
          active: row.is_active ?? null,
          revoked: Boolean(row.revoked_at),
          expired,
        }
      : null,
  });
}
