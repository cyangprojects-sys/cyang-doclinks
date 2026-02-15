import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { alias: string } }) {
    const alias = decodeURIComponent(params.alias).toLowerCase();

    const rows = (await sql`
    select doc_id::text as doc_id, is_active
    from doc_aliases
    where alias = ${alias}
    limit 1
  `) as { doc_id: string; is_active: boolean }[];

    if (!rows.length || !rows[0].is_active) {
        // nice not-found page (or change to NextResponse.redirect('/'))
        return new NextResponse("This link is invalid or inactive.", { status: 404 });
    }

    const docId = rows[0].doc_id;

    // absolute URL based on current request
    const url = new URL(`/serve/${docId}`, req.url);
    return NextResponse.redirect(url, 302);
}
