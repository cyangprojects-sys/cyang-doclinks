// src/app/admin/dashboard/UploadPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
    | { ok: true; doc_id: string; alias: string; view_url: string; target_url?: string }
    | { ok: false; error: string; message?: string };

function fmtBytes(n: number) {
    if (!Number.isFinite(n)) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UploadPanel() {
    const router = useRouter();

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

        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
            setError("Only PDFs are allowed.");
            return;
        }

        setBusy(true);
        try {
            // 1) Presign
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

            const presignJson = (await presignRes.json().catch(() => null)) as PresignResponse | null;
            if (!presignRes.ok || !presignJson || presignJson.ok === false) {
                const msg =
                    (presignJson as any)?.message ||
                    (presignJson as any)?.error ||
                    `Init failed (${presignRes.status})`;
                throw new Error(msg);
            }

            // 2) PUT to R2
            const putRes = await fetch(presignJson.upload_url, {
                method: "PUT",
                headers: { "content-type": "application/pdf" },
                body: file,
            });

            if (!putRes.ok) {
                const txt = await putRes.text().catch(() => "");
                throw new Error(`R2 upload failed (${putRes.status})${txt ? `: ${txt}` : ""}`);
            }

            // 3) Complete
            const completeRes = await fetch("/api/admin/upload/complete", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    doc_id: presignJson.doc_id,
                    title: title || file.name,
                    original_filename: file.name,
                    r2_bucket: presignJson.bucket,
                    r2_key: presignJson.r2_key,
                }),
            });

            const completeJson = (await completeRes.json().catch(() => null)) as CompleteResponse | null;
            if (!completeRes.ok || !completeJson || completeJson.ok === false) {
                const msg =
                    (completeJson as any)?.message ||
                    (completeJson as any)?.error ||
                    `Complete failed (${completeRes.status})`;
                throw new Error(msg);
            }

            setDocId(completeJson.doc_id);
            setViewUrl(completeJson.view_url);

            // Clear inputs (optional, but nice)
            setTitle("");
            setFile(null);

            // ✅ Re-run server component queries so the docs table updates
            router.refresh();
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Upload document</h2>
                    <p className="mt-1 text-sm text-neutral-400">
                        Direct-to-R2 signed PUT. Creates doc row first, then finalizes and generates alias.
                    </p>
                </div>

                <button
                    onClick={onUpload}
                    disabled={busy || !file}
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800 disabled:opacity-50 disabled:hover:bg-neutral-900"
                >
                    {busy ? "Uploading…" : "Upload"}
                </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                    <label className="block text-xs font-medium text-neutral-400">Title (optional)</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Shown in admin list / emails"
                        disabled={busy}
                        className="mt-2 w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600 disabled:opacity-70"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-neutral-400">PDF file</label>
                    <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        disabled={busy}
                        className="mt-2 w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-100 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1 file:text-sm file:text-neutral-100 hover:file:bg-neutral-700 disabled:opacity-70"
                    />
                    <div className="mt-2 text-xs text-neutral-500">{fileLabel}</div>
                </div>
            </div>

            {error ? <div className="mt-3 text-sm font-semibold text-red-400">{error}</div> : null}

            {docId ? (
                <div className="mt-4 rounded-lg border border-neutral-800 bg-black/30 p-3">
                    <div className="text-sm font-semibold text-emerald-300">Uploaded ✅</div>
                    <div className="mt-2 text-xs text-neutral-400 font-mono">{docId}</div>

                    {viewUrl ? (
                        <a
                            href={viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-block rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800"
                        >
                            Open magic link
                        </a>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
