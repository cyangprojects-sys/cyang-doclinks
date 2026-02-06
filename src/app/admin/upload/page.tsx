"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";

type UploadResult = {
  ok: true;
  view_url: string;
  doc_id: string;
  pointer: string;
};

export default function AdminUploadPage() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileLabel = useMemo(() => {
    if (!file) return "Drop a PDF here or click to choose";
    return `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }, [file]);

  async function onUpload() {
    setError(null);
    setResult(null);

    if (!file) {
      setError("Choose a PDF first.");
      return;
    }

    const nameLower = (file.name || "").toLowerCase();
    const isPdf = file.type === "application/pdf" || nameLower.endsWith(".pdf");
    if (!isPdf) {
      setError("Only PDFs are supported.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        // Try to show JSON error if provided
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || `Upload failed (${res.status})`);
        }
        const txt = await res.text();
        throw new Error(txt || `Upload failed (${res.status})`);
      }

      const data = (await res.json()) as UploadResult;

      // Hard guard against "undefined" routes
      if (!data?.view_url || !data?.doc_id) {
        throw new Error("Upload succeeded but response was missing doc_id/view_url.");
      }

      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <div className="text-xl font-semibold">Admin Upload</div>
          <div className="text-sm opacity-70">Upload a PDF to R2 and create a private /d/&lt;docId&gt; link</div>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
          <div className="space-y-2">
            <div className="text-sm opacity-80">Title (optional)</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Enter Document Name"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none"
            />
          </div>

          <label
            className="block rounded-2xl border border-dashed border-white/20 bg-black/20 p-10 text-center cursor-pointer hover:bg-black/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="text-sm opacity-80">{fileLabel}</div>
            <div className="mt-2 text-xs opacity-60">PDF only</div>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={onUpload}
              disabled={busy}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-60"
            >
              {busy ? "Uploading..." : "Upload"}
            </button>

            {file && (
              <button
                onClick={() => setFile(null)}
                disabled={busy}
                className="rounded-xl border border-white/15 px-4 py-3 text-sm hover:bg-white/5 disabled:opacity-60"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm space-y-2">
              <div className="opacity-80">✅ Uploaded</div>

              <div>
                <span className="opacity-60">Doc ID:</span> {result.doc_id}
              </div>

              <div className="break-all">
                <span className="opacity-60">Pointer:</span> {result.pointer}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <a
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
                  href={result.view_url}
                >
                  Open link
                </a>
                <span className="text-xs opacity-60">{result.view_url}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
