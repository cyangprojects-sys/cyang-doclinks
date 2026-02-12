// src/app/api/admin/docs/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { sql } from "@/lib/db";

export async function GET() {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase().trim();
    const owner = (process.env.OWNER_EMAIL || "").toLowerCase().trim();

    if (!email || !owner || email !== owner) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const rows = await sql(
        `
    select
      d.id::text as id,
      d.title,
      d.filename,
      d.content_type,
      d.bytes,
      d.created_at,
      (select a.alias from doc_aliases a where a.doc_id = d.id order by a.created_at desc limit 1) as alias
    from documents d
    order by d.created_at desc
    limit 200
    `,
        []
    );

    const docs = (rows as any) || (rows as any).rows;
    return Response.json({ ok: true, docs });
}
