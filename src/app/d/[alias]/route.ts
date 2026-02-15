import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
    _req: Request,
    context: { params: Promise<{ alias: string }> }
) {
    const { alias: rawAlias } = await context.params;
    const alias = decodeURIComponent(rawAlias).toLowerCase();

    const dbInfo = await sql`select current_database() as db, current_schema() as schema`;
    const counts = await sql`
    select
      (select count(*)::int from public.doc_aliases) as aliases_count,
      (select count(*)::int from public.documents) as documents_count
  `;
    const row = await sql`
    select alias, doc_id::text as doc_id, is_active, created_at
    from public.doc_aliases
    where alias = ${alias}
    limit 1
  `;

    return NextResponse.json({
        ok: true,
        alias,
        dbInfo: dbInfo[0],
        counts: counts[0],
        row: row[0] ?? null,
    });
}
