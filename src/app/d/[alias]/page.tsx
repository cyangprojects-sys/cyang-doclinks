import { sql } from "@/lib/db";
import ShareForm from "./ShareForm";

export const dynamic = "force-dynamic";

export default async function DocAdminPage({
    params,
}: {
    params: { alias: string };
}) {
    const alias = decodeURIComponent(params.alias).toLowerCase();

    const rows = (await sql`
    select a.doc_id, a.is_active
    from doc_aliases a
    where a.alias = ${alias}
    limit 1
  `) as { doc_id: string; is_active: boolean }[];

    if (!rows.length || !rows[0].is_active) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Not found</h1>
                <p style={{ opacity: 0.8 }}>This link is invalid or inactive.</p>
            </div>
        );
    }

    const docId = rows[0].doc_id;

    return (
        <div style={{ padding: 24, display: "grid", gap: 16 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Document</h1>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
                <div
                    style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        overflow: "hidden",
                    }}
                >
                    <iframe
                        src={`/d/${encodeURIComponent(alias)}/raw`}
                        style={{ width: "100%", height: "80vh", border: 0 }}
                        title="PDF viewer"
                    />
                </div>

                <div
                    style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        padding: 16,
                        height: "fit-content",
                    }}
                >
                    <ShareForm docId={docId} />
                </div>
            </div>
        </div>
    );
}
