import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    context: { params: Promise<{ alias: string }> }
) {
    const { alias: rawAlias } = await context.params;
    const alias = decodeURIComponent(rawAlias || "").trim().toLowerCase();

    if (!alias) {
        return NextResponse.json(
            { ok: false, error: "missing_alias" },
            { status: 400 }
        );
    }

    const dbInfo = await sql`
    select current_database() as db, current_schema() as schema
  `;

    const rowDocAliases = await sql`
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

    const rowDocumentAliases = await sql`
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

    const row = rowDocAliases?.[0] ?? rowDocumentAliases?.[0] ?? null;

    return NextResponse.json({
        ok: true,
        alias,
        db: dbInfo?.[0] ?? null,
        found: !!row,
        row,
    });
}
``
