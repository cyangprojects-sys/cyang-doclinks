export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyApiKeyFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const rows = (await sql`
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
    limit 200
  `) as unknown as Array<{ id: string; title: string | null; created_at: string; alias: string | null }>;

  return NextResponse.json({ ok: true, docs: rows });
}
