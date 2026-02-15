import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const dbInfo = await sql`
      select
        current_database() as db,
        current_schema() as schema,
        inet_server_addr()::text as server_addr,
        inet_server_port() as server_port
    `;

        const counts = await sql`
      select
        (select count(*)::int from public.doc_aliases) as aliases_count,
        (select count(*)::int from public.documents) as documents_count
    `;

        // Show columns of doc_aliases in prod
        const aliasCols = await sql`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'doc_aliases'
      order by ordinal_position
    `;

        // Show a few aliases without ordering by id
        const sampleAlias = await sql`
      select alias, doc_id::text as doc_id, is_active
      from public.doc_aliases
      limit 10
    `;

        return NextResponse.json({
            ok: true,
            dbInfo: dbInfo[0],
            counts: counts[0],
            aliasCols,
            sampleAlias,
            vercel: {
                env: process.env.VERCEL_ENV,
                commit: process.env.VERCEL_GIT_COMMIT_SHA,
            },
        });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message ?? String(e) },
            { status: 500 }
        );
    }
