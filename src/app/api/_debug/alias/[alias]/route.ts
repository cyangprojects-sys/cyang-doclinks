import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { alias: string } }
) {
  const alias = decodeURIComponent(params.alias).toLowerCase();

  const db = await sql`select current_database() as db, current_schema() as schema`;
  const counts = await sql`
    select
      (select count(*)::int from doc_aliases) as aliases_count,
      (select count(*)::int from documents) as documents_count
  `;
  const row = await sql`
    select alias, doc_id::text as doc_id, is_active, created_at
    from doc_aliases
    where alias = ${alias}
    limit 1
  `;

  return NextResponse.json({
    ok: true,
    alias,
    db: db[0],
    counts: counts[0],
    row: row[0] ?? null,
  });
}
