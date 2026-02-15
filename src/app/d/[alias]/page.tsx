import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DocViewPage({
    params,
}: {
    params: { alias: string };
}) {
    const alias = decodeURIComponent(params.alias).toLowerCase();

    const rows = (await sql`
    select doc_id::text as doc_id, is_active
    from public.doc_aliases
    where alias = ${alias}
    limit 1
  `) as { doc_id: string; is_active: boolean }[];

    if (!rows.length || !rows[0].is_active) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800 }}>Not found</h1>
                <p style={{ opacity: 0.8 }}>This link is invalid or inactive.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: 16 }}>
            <iframe
                src={`/d/${encodeURIComponent(alias)}/raw`}
                style={{ width: "100%", height: "90vh", border: 0 }}
                title="PDF"
            />
        </div>
    );
}
