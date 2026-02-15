import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    context: { params: Promise<{ alias: string }> }
) {
    const { alias: rawAlias } = await context.params;
    const alias = decodeURIComponent(rawAlias).toLowerCase();

    const rows = (await sql`
    select doc_id::text as doc_id, is_active
    from doc_aliases
    where alias = ${alias}
    limit 1
  `) as { doc_id: string; is_active: boolean }[];

    if (!rows.length || !rows[0].is_active) {
        return new NextResponse("This link is invalid or inactive.", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
        });
    }

    const docId = rows[0].doc_id;

    // Absolute URL based on the incoming request URL
    const url = new URL(`/serve/${docId}`, req.url);
    return NextResponse.redirect(url, 302);
}
