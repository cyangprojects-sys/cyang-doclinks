import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DocViewPage({
    params,
}: {
    params: Promise<{ alias: string }>;
}) {
    const { alias: raw } = await params;
    const alias = decodeURIComponent(raw).toLowerCase();

    const rows = await sql`
    select doc_id::text as doc_id, is_active
    from public.doc_aliases
    where alias = ${alias}
    limit 1
  `;

    if (!rows.length || !rows[0].is_active) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>Not found</h1>
                <p style={{ opacity: 0.8 }}>
                    This link is invalid or inactive.
                </p>
            </div>
        );
    }

    return (
        <div style={{ padding: 16 }}>
            <iframe
                src={`/d/${encodeURIComponent(alias)}/raw`}
                style={{
                    width: "100%",
                    height: "92vh",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                }}
                title="PDF Viewer"
            />
        </div>
    );
}
