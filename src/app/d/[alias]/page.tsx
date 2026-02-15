import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DAliasDebugPage({
    params,
}: {
    params: Promise<{ alias: string }>;
}) {
    const { alias: raw } = await params;
    const decoded = decodeURIComponent(raw);
    const normalized = decoded.toLowerCase();

    let row: any = null;
    let error: any = null;

    try {
        const rows = await sql`
      select alias, doc_id::text as doc_id, is_active, created_at
      from public.doc_aliases
      where alias = ${normalized}
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
                    raw,
                    decoded,
                    normalized,
                    row,
                    error,
                },
                null,
                2
            )}
        </pre>
    );
}
