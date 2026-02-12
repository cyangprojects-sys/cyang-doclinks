export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminUploadPage() {
    return (
        <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
            <h1 style={{ marginBottom: 12 }}>Upload New PDF</h1>

            <p style={{ opacity: 0.75, marginBottom: 18 }}>
                This is the direct-to-R2 upload page.
            </p>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <a href="/admin" style={{ textDecoration: "underline" }}>
                    ← Back to Admin
                </a>
            </div>

            <div
                style={{
                    marginTop: 20,
                    border: "1px solid #333",
                    borderRadius: 12,
                    padding: 16,
                    background: "#111",
                }}
            >
                <p style={{ margin: 0, opacity: 0.8 }}>
                    If you can see this page without redirect loops, your routing + owner
                    gate is working. Next step is wiring the uploader UI to:
                </p>
                <ul style={{ marginTop: 10, opacity: 0.85 }}>
                    <li><code>/api/admin/upload/init</code></li>
                    <li><code>/api/admin/upload/complete</code></li>
                </ul>
            </div>
        </main>
    );
}

