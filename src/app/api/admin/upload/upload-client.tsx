"use client";

import { useMemo, useRef, useState } from "react";

type InitResponse =
    | { ok: true; doc_id: string; key: string; upload_url: string }
    | { ok: false; error: string; details?: any };

type CompleteResponse =
    | { ok: true; doc_id: string; size_bytes: number; content_type: string }
    | { ok: false; error: string };

export default function DirectUploadClient() {
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);

    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<number>(0);

    const [docId, setDocId] = useState<string | null>(null);
    const [key, setKey] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [doneMsg, setDoneMsg] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement | null>(null);

    const fileLabel = useMemo(() => {
        if (!file) return "Choose a PDF…";
        const kb = Math.round(file.size / 1024);
        return `${file.name} (${kb.toLocaleString()} KB)`;
    }, [file]);

    function isPdf(f: File) {
        return f.type === "application/pdf" && f.name.toLowerCase().endsWith(".pdf");
    }

    async function initUpload(): Promise<InitResponse> {
        const res = await fetch("/api/admin/upload/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title.trim(),
                originalName: file!.name,
                contentType: file!.type,
                sizeBytes: file!.size,
            }),
        });
        return res.json();
    }

    function putWithProgress(url: string, f: File): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", url, true);

            // Must match what the server signed
            xhr.setRequestHeader("Content-Type", "application/pdf");

            xhr.upload.onprogress = (evt) => {
                if (!evt.lengthComputable) return;
                const pct = Math.round((evt.loaded / evt.total) * 100);
                setProgress(pct);
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error(`PUT failed: ${xhr.status}`));
            };

            xhr.onerror = () => reject(new Error("Network error during PUT"));
            xhr.send(f);
        });
    }

    async function completeUpload(docId: string): Promise<CompleteResponse> {
        const res = await fetch("/api/admin/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docId }),
        });
        return res.json();
    }

    async function onUpload() {
        setError(null);
        setDoneMsg(null);
        setProgress(0);
        setDocId(null);
        setKey(null);

        if (!file) return setError("Choose a PDF first.");
        if (!title.trim()) return setError("Enter a title.");
        if (!isPdf(file)) return setError("Only PDF files are allowed.");

        setBusy(true);
        try {
            const init = await initUpload();
            if (!init.ok) {
                throw new Error(init.error || "Init failed");
            }

            setDocId(init.doc_id);
            setKey(init.key);

            await putWithProgress(init.upload_url, file);

            const done = await completeUpload(init.doc_id);
            if (!done.ok) throw new Error(done.error || "Complete failed");

            setDoneMsg(`Uploaded ✓ (${done.size_bytes.toLocaleString()} bytes)`);
        } catch (e: any) {
            setError(e?.message || "Upload failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>Title</span>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., Final Clearance Memo – SP 8888-88"
                        style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "transparent" }}
                    />
                </label>

                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <span style={{ opacity: 0.85 }}>{fileLabel}</span>
                </div>

                <button
                    onClick={onUpload}
                    disabled={busy}
                    style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: busy ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontWeight: 700,
                    }}
                >
                    {busy ? "Uploading…" : "Upload"}
                </button>

                <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ height: 10, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div
                            style={{
                                height: "100%",
                                width: `${progress}%`,
                                background: "rgba(255,255,255,0.35)",
                                transition: "width 120ms linear",
                            }}
                        />
                    </div>
                    <div style={{ opacity: 0.85, fontSize: 13 }}>{progress}%</div>
                </div>

                {docId && (
                    <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                        <div>
                            <b>doc_id:</b> {docId}
                        </div>
                        <div>
                            <b>key:</b> {key}
                        </div>
                    </div>
                )}

                {doneMsg && <div style={{ color: "lightgreen", fontWeight: 700 }}>{doneMsg}</div>}
                {error && <div style={{ color: "salmon", fontWeight: 700 }}>{error}</div>}
            </div>
        </section>
    );
}
