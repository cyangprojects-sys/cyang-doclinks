import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ alias: string }> }
) {
  const { alias: rawAlias } = await context.params;
  const alias = decodeURIComponent(rawAlias).toLowerCase().trim();

  if (!alias) {
    return NextResponse.json({ ok: false, error: "missing_alias" }, { status: 400 });
  }

  // Helpful to verify you're pointed at the DB you think you are
  const dbInfo = await sql`
    select current_database() as db, current_schema() as schema
  `;

  // Use docs table (your app uses public.docs). Avoid exploding if counts fail.
  let counts: any = null;
  try {
    const c = await sql`
      select
        (select count(*)::int from public.doc_aliases) as doc_aliases_count,
        (select count(*)::int from public.document_aliases) as document_aliases_count,
        (select count(*)::int from public.docs) as docs_count
    `;
    counts = c?.[0] ?? null;
  } catch (e: any) {
    counts = { error: e?.message ?? "counts_failed" };
  }

  // Look in both alias tables (your resolver does this too)
  const rowDocAliases = await sql`
    select
      'doc_aliases'::text as table,
      alias,
      doc_id::text as doc_id,
      is_active,
      revoked_at::text as revoked_at,
      expires_at::text as expires_at,
      created_at::text as created_at
    from public.doc_aliases
    where alias = ${alias}
    limit 1
  `;

  const rowDocumentAliases = await sql`
    select
      'document_aliases'::text as table,
      alias,
      doc_id::text as doc_id,
      null::bool as is_active,
      null::text as revoked_at,
      expires_at::text as expires_at,
      created_at::text as created_at
    from public.document_aliases
    where alias = ${alias}
    limit 1
  `;

  const row = rowDocAliases?.[0] ?? rowDocumentAliases?.[0] ?? null;

  return NextResponse.json({
    ok: true,
    alias,
    dbInfo: dbInfo?.[0] ?? null,
    counts,
    row,
  });
}
