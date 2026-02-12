import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DocRow = {
    id: string;
    created_at: string;
    status: string;
    size_bytes: number | null;
    content_type: string | null;
};

export default async function AdminPage() {
    let docs: DocRow[] = [];

    try {
        docs = (await sql`
      select id, created_at, status, size_bytes, content_type
      from docs
      order by created_at desc
      limit 50
    `) as unknown as DocRow[];
    } catch (err) {
        console.error("Failed loading docs:", err);
    }

    return (
        <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
            <h1 style={{ marginBottom: 20 }}>Admin Dashboard</h1>

            {/* Upload Button */}
            <div style={{ marginBottom: 30 }}>
                <a
                    href="/admin/upload"
                    style={{
                        display: "inline-block",
                        padding: "12px 18px",
                        borderRadius: 10,
                        border: "1px solid #444",
                        textDecoration: "none",
                        fontWeight: 500,
                    }}
                >
                    Upload New PDF
                </a>
            </div>

            {/* Documents List */}
            <h2 style={{ marginBottom: 12 }}>Recent Documents</h2>

            {docs.length === 0 && (
                <p style={{ opacity: 0.7 }}>No documents found.</p>
            )}

            <div style={{ display: "grid", gap: 14 }}>
                {docs.map((doc) => (
                    <div
                        key={doc.id}
                        style={{
                            border: "1px solid #333",
                            borderRadius: 12,
                            padding: 16,
                            background: "#111",
                        }}
                    >
                        <div style={{ fontSize: 14, opacity: 0.7 }}>
                            {new Date(doc.created_at).toLocaleString()}
                        </div>

                        <div style={{ fontFamily: "monospace", margin: "6px 0" }}>
                            {doc.id}
                        </div>

                        <div>Status: {doc.status}</div>

                        {doc.size_bytes && (
                            <div>
                                Size: {(doc.size_bytes / 1024).toFixed(1)} KB
                            </div>
                        )}

                        {doc.content_type && (
                            <div>Type: {doc.content_type}</div>
                        )}

                        <div style={{ marginTop: 8 }}>
                            <a
                                href={`/d/${doc.id}`}
                                target="_blank"
                                style={{ fontSize: 14 }}
                            >
                                View
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
