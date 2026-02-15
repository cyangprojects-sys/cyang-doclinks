"use client";

import { useMemo, useState } from "react";

type PresignResponse =
    | {
        ok: true;
        doc_id: string;
        upload_url: string;
        r2_key: string;
        bucket: string;
        expires_in: number;
    }
    | { ok: false; error: string; message?: string };

type CompleteResponse =
    | { ok: true; doc_id: string; size_bytes: number; content_type: string }
    | { ok: false; error: string; message?: string };

function fmtBytes(n: number) {
    if (!Number.isFinite(n)) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminUploadPage() {
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [docId, setDocId] = useState<string | null>(null);
    const [viewUrl, setViewUrl] = useState<string | null>(null);

    const fileLabel = useMemo(() => {
        if (!file) return "Choose a PDF…";
        return `${file.name} (${fmtBytes(file.size)})`;
    }, [file]);

    async function onUpload() {
        setError(null);
        setDocId(null);
        setViewUrl(null);

        if (!file) {
            setError("Choose a PDF first.");
            return;
        }

        const isPdf =
            file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
            setError("Only PDFs are allowed.");
            return;
        }

        setBusy(true);
        try {
            // 1) Presign: get docId + signed PUT URL
            const presignRes = await fetch("/api/admin/upload/presign", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    title: title || file.name,
                    filename: file.name,
                    contentType: "application/pdf",
                    sizeBytes: file.size,
                }),
            });

            const presignJson = (await presignRes.json().catch(() => null)) as
                | PresignResponse
                | null;

            if (!presignRes.ok || !presignJson || presignJson.ok === false) {
                const msg =
                    (presignJson as any)?.message ||
                    (presignJson as any)?.error ||
                    `Init failed (${presignRes.status})`;
                throw new Error(msg);
            }

            // 2) PUT file directly to R2 (must match ContentType used in presign)
            const putRes = await fetch(presignJson.upload_url, {
                method: "PUT",
                headers: {
                    "content-type": "application/pdf",
                },
                body: file,
            });

            if (!putRes.ok) {
                const txt = await putRes.text().catch(() => "");
                throw new Error(`R2 upload failed (${putRes.status})${txt ? `: ${txt}` : ""}`);
            }

            // 3) Complete: server verifies HEAD + marks ready
            const completeRes = await fetch("/api/admin/upload/complete", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ docId: presignJson.doc_id }),
            });

            const completeJson = (await completeRes.json().catch(() => null)) as
                | CompleteResponse
                | null;

            if (!completeRes.ok || !completeJson || completeJson.ok === false) {
                const msg =
                    (completeJson as any)?.message ||
                    (completeJson as any)?.error ||
                    `Complete failed (${completeRes.status})`;
                throw new Error(msg);
            }

            setDocId(presignJson.doc_id);
            setViewUrl(`/d/${presignJson.doc_id}`);
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h1 style={{ marginBottom: 6 }}>Upload New PDF</h1>
                <a href="/admin" style={{ textDecoration: "underline", opacity: 0.85 }}>
                    Back to Admin
                </a>
            </div>

            <p style={{ opacity: 0.75, marginTop: 0 }}>
                This uploads directly to R2 using a signed PUT URL. The server only creates the doc record and
                verifies the object exists.
            </p>

            <div
                style={{
                    border: "1px solid #333",
                    borderRadius: 12,
                    padding: 16,
                    background: "#111",
                    display: "grid",
                    gap: 12,
                    marginTop: 14,
                }}
            >
                <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 14, opacity: 0.85 }}>Title (optional)</span>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Shown in admin list / emails"
                        style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #333",
                            background: "#0b0b0b",
                            color: "white",
                        }}
                        disabled={busy}
                    />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 14, opacity: 0.85 }}>PDF file</span>
                    <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        disabled={busy}
                        style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #333",
                            background: "#0b0b0b",
                            color: "white",
                        }}
                    />
                    <span style={{ fontSize: 13, opacity: 0.7 }}>{fileLabel}</span>
                </label>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                        type="button"
                        onClick={onUpload}
                        disabled={busy}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #444",
                            background: busy ? "#222" : "#111",
                            color: "white",
                            cursor: busy ? "not-allowed" : "pointer",
                            fontWeight: 600,
                        }}
                    >
                        {busy ? "Uploading…" : "Upload"}
                    </button>

                    {error ? <span style={{ color: "#ff7b7b" }}>{error}</span> : null}
                </div>

                {docId && (
                    <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 14, opacity: 0.85 }}>Uploaded ✅</div>
                        <div style={{ fontFamily: "monospace", marginTop: 6 }}>{docId}</div>
                        {viewUrl && (
                            <div style={{ marginTop: 10 }}>
                                <a href={viewUrl} target="_blank" style={{ textDecoration: "underline" }}>
                                    Open magic link
                                </a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
