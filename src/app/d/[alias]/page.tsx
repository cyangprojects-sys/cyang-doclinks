import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DAliasDebugPage({
    params,
}: {
    params: { alias: string };
}) {
    const raw = params.alias;
    const alias = decodeURIComponent(raw).toLowerCase();

    let row: any = null;
    let error: any = null;

    try {
        const rows = await sql`
      select alias, doc_id::text as doc_id, is_active, created_at
      from public.doc_aliases
      where alias = ${alias}
      limit 1
    `;
        row = rows[0] ?? null;
    } catch (e: any) {
        error = e?.message ?? String(e);
    }

    return (
        <pre style={{ padding: 24 }}>
            {JSON.stringify(
                {
                    params,
                    raw,
                    decoded: decodeURIComponent(raw),
                    normalized: alias,
                    row,
                    error,
                },
                null,
                2
            )}
        </pre>
    );
}
