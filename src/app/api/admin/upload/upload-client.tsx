"use client";

import { useMemo, useState } from "react";

type PresignOk = {
    ok: true;
    doc_id: string;
    upload_url: string;
    r2_key: string;
    bucket: string;
    expires_in: number;
};

type CompleteOk = {
    ok: true;
    doc_id: string;
    size_bytes: number;
    content_type: string;
};

function humanBytes(n: number) {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
        v = v / 1024;
        i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function readJsonSafe(res: Response) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

export default function DirectUploadClient() {
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fileLabel = useMemo(() => {
        if (!file) return "Choose a PDF…";
        return `${file.name} (${humanBytes(file.size)})`;
    }, [file]);

    async function presign(): Promise<PresignOk> {
        const res = await fetch("/api/admin/upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title.trim() ? title.trim() : undefined,
                filename: file?.name ?? "",
                contentType: file?.type || "application/pdf",
                sizeBytes: file?.size,
            }),
        });

        const data = await readJsonSafe(res);

        if (!res.ok || !data?.ok) {
            const msg = data?.message || data?.error || `Presign failed (${res.status})`;
            throw new Error(msg);
        }

        return data as PresignOk;
    }

    async function uploadToR2(uploadUrl: string) {
        if (!file) throw new Error("No file selected.");

        const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                // MUST match the ContentType used when presigning
                "Content-Type": "application/pdf",
            },
            body: file,
        });

        if (!put.ok) {
            const txt = await put.text().catch(() => "");
            throw new Error(`R2 upload failed (${put.status})${txt ? `: ${txt}` : ""}`);
        }
    }

    async function complete(docId: string): Promise<CompleteOk> {
        const res = await fetch("/api/admin/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docId }),
        });

        const data = await readJsonSafe(res);

        if (!res.ok || !data?.ok) {
            const msg = data?.message || data?.error || `Complete failed (${res.status})`;
            throw new Error(msg);
        }

        return data as CompleteOk;
    }

    async function onUpload() {
        setError(null);
        setSuccess(null);

        if (!file) {
            setError("Choose a PDF first.");
            return;
        }

        const isPdf =
            file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
            setError("Only PDF files are allowed.");
            return;
        }

        setBusy(true);
        try {
            const p = await presign();
            await uploadToR2(p.upload_url);
            const done = await complete(p.doc_id);

            setSuccess(`Uploaded ✅ ${humanBytes(done.size_bytes)}`);
            setTitle("");
            setFile(null);
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 18 }}>
            <div style={{ display: "grid", gap: 12 }}>
                <div>
                    <label style={{ display: "block", fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
                        Title (optional)
                    </label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={busy}
                        placeholder="Shown in admin list / emails"
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,.12)",
                            background: "transparent",
                            color: "inherit",
                            outline: "none",
                        }}
                    />
                </div>

                <div>
                    <label style={{ display: "block", fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
                        PDF file
                    </label>

                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                            type="file"
                            accept="application/pdf"
                            disabled={busy}
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        />
                        <span style={{ fontSize: 12, opacity: 0.8 }}>{fileLabel}</span>
                    </div>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                    <button
                        onClick={onUpload}
                        disabled={busy}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,.15)",
                            background: "rgba(255,255,255,.04)",
                            color: "inherit",
                            cursor: busy ? "not-allowed" : "pointer",
                            fontWeight: 600,
                        }}
                    >
                        {busy ? "Uploading…" : "Upload"}
                    </button>

                    {error ? <span style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</span> : null}
                    {success ? <span style={{ color: "#51cf66", fontSize: 13 }}>{success}</span> : null}
                </div>

                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                    This flow: presign → PUT to R2 → complete.
                </div>
            </div>
        </section>
    );
}
