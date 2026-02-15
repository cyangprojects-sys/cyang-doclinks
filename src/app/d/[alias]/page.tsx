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
    from doc_aliases
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
        <div
            style={{
                padding: 16,
                display: "grid",
                gap: 12,
                maxWidth: 1200,
                margin: "0 auto",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Cyang Docs</div>
                <div style={{ opacity: 0.6 }}>/{alias}</div>

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <a
                        href={`/d/${encodeURIComponent(alias)}/raw`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            border: "1px solid rgba(255,255,255,0.15)",
                            padding: "8px 10px",
                            borderRadius: 10,
                            textDecoration: "none",
                            color: "inherit",
                            fontWeight: 600,
                        }}
                    >
                        Open
                    </a>
                    <a
                        href={`/d/${encodeURIComponent(alias)}/raw?download=1`}
                        style={{
                            border: "1px solid rgba(255,255,255,0.15)",
                            padding: "8px 10px",
                            borderRadius: 10,
                            textDecoration: "none",
                            color: "inherit",
                            fontWeight: 600,
                        }}
                    >
                        Download
                    </a>
                </div>
            </div>

            <div
                style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.03)",
                }}
            >
                <iframe
                    src={`/d/${encodeURIComponent(alias)}/raw`}
                    style={{ width: "100%", height: "84vh", border: 0 }}
                    title="PDF"
                />
            </div>
        </div>
    );
}
