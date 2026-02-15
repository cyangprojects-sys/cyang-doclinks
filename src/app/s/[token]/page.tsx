export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShareTokenPage({
    params,
}: {
    params: { token: string };
}) {
    const token = params.token;

    return (
        <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <a
                    href={`/s/${encodeURIComponent(token)}/raw`}
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
                    href={`/s/${encodeURIComponent(token)}/raw?download=1`}
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

            <iframe
                src={`/s/${encodeURIComponent(token)}/raw`}
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
