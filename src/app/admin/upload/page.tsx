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
  | { ok: true; doc_id: string; alias: string; view_url: string; target_url?: string }
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

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Only PDFs are allowed.");
      return;
    }

    setBusy(true);
    try {
      // 1) Presign: get doc_id + signed PUT URL
      // Matches BodySchema in /api/admin/upload/presign:
      // { title, filename, contentType, sizeBytes }
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

      // 2) PUT file directly to R2 (must match ContentType used in presign)
      const putRes = await fetch(presignJson.upload_url, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: file,
      });

      if (!putRes.ok) {
        const txt = await putRes.text().catch(() => "");
        throw new Error(`R2 upload failed (${putRes.status})${txt ? `: ${txt}` : ""}`);
      }

      // 3) Complete: IMPORTANT: send doc_id so the server doesn't need to guess.
      // (We also include r2_bucket + r2_key as back-compat / debug context.)
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
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Upload New PDF</h1>
        <a href="/admin" style={{ color: "inherit", opacity: 0.8, textDecoration: "none" }}>
          Back to Admin
        </a>
      </div>

      <p style={{ opacity: 0.8, marginTop: 10, lineHeight: 1.5 }}>
        This uploads directly to R2 using a signed PUT URL. The server creates the doc row first
        (doc_id), then you upload, then we finalize and generate the alias.
      </p>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 16,
          marginTop: 16,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Title (optional)</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Shown in admin list / emails"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "#0b0b0b",
              color: "white",
              outline: "none",
            }}
            disabled={busy}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>PDF file</div>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "#0b0b0b",
              color: "white",
            }}
          />
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>{fileLabel}</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          <button
            onClick={onUpload}
            disabled={busy}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Uploading…" : "Upload"}
          </button>

          {error ? <div style={{ color: "#ff6b6b", fontWeight: 700 }}>{error}</div> : null}
        </div>

        {docId ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Uploaded ✅</div>
            <div style={{ opacity: 0.9, marginBottom: 6 }}>
              <code>{docId}</code>
            </div>

            {viewUrl ? (
              <a
                href={viewUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                  textDecoration: "none",
                  color: "inherit",
                  fontWeight: 700,
                }}
              >
                Open magic link
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
