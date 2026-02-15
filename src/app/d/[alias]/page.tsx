import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DocDebugPage({
    params,
}: {
    params: { alias: string };
}) {
    const alias = decodeURIComponent(params.alias).toLowerCase();

    let rows: any = [];
    let dbInfo: any = null;
    let counts: any = null;
    let error: any = null;

    try {
        // What database are we actually connected to?
        dbInfo = await sql`
      select current_database() as db, current_schema() as schema
    `;

        // Basic sanity counts
        counts = await sql`
      select
        (select count(*)::int from doc_aliases) as aliases_count,
        (select count(*)::int from documents) as documents_count
    `;

        // Actual alias lookup
        rows = await sql`
      select a.alias, a.doc_id::text as doc_id, a.is_active, a.created_at
      from doc_aliases a
      where a.alias = ${alias}
      limit 1
    `;
    } catch (e: any) {
        error = e?.message || String(e);
    }

    console.log("ALIAS PARAM:", alias);
    console.log("DB INFO:", dbInfo);
    console.log("COUNTS:", counts);
    console.log("ROWS:", rows);
    console.log("ERROR:", error);

    return (
        <pre style={{ padding: 24 }}>
            {JSON.stringify(
                {
                    alias,
                    dbInfo,
                    counts,
                    rows,
                    error,
                },
                null,
                2
            )}
        </pre>
    );
}
