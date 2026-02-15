"use client";

import { useMemo, useState } from "react";

export const dynamic = "force-dynamic";

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
  | { ok: true; doc_id: string; alias: string; view_url: string }
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
  const [result, setResult] = useState<{ alias: string; view_url: string } | null>(null);

  const fileLabel = useMemo(() => {
    if (!file) return "Choose a PDF";
    return `${file.name} (${fmtBytes(file.size)})`;
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
      setError("Only PDF files are supported.");
      return;
    }

    setBusy(true);
    try {
      // 1) Presign: MUST match BodySchema in presign/route.ts
      //    BodySchema keys are: title, filename, contentType, sizeBytes
      const presignRes = await fetch("/api/admin/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || undefined,
          filename: file.name,
          contentType: "application/pdf",
          sizeBytes: file.size,
        }),
      });

      const presignJson = (await presignRes.json()) as PresignResponse;
      if (!presignRes.ok || !presignJson.ok) {
        setError(
          presignJson && "error" in presignJson
            ? `${presignJson.error}${presignJson.message ? `: ${presignJson.message}` : ""}`
            : "Presign failed."
        );
        return;
      }

      // IMPORTANT: doc_id must be carried into /complete
      const docId = presignJson.doc_id;
      const uploadUrl = presignJson.upload_url;

      if (!docId) {
        setError("Presign did not return doc_id.");
        return;
      }

      // 2) Upload directly to R2 via signed PUT URL
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/pdf",
        },
        body: file,
      });

      if (!putRes.ok) {
        const txt = await putRes.text().catch(() => "");
        setError(`Upload failed (${putRes.status}). ${txt}`);
        return;
      }

      // 3) Complete: send doc_id + metadata
      const completeRes = await fetch("/api/admin/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: docId,
          title: title || null,
          original_filename: file.name,
        }),
      });

      const completeJson = (await completeRes.json()) as CompleteResponse;
      if (!completeRes.ok || !completeJson.ok) {
        setError(
          completeJson && "error" in completeJson
            ? `${completeJson.error}${completeJson.message ? `: ${completeJson.message}` : ""}`
            : "Complete failed."
        );
        return;
      }

      setResult({ alias: completeJson.alias, view_url: completeJson.view_url });
    } catch (e: any) {
      setError(e?.message || "Upload failed.");
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
        This uploads directly to R2 using a signed PUT URL. The server creates the doc row first (doc_id),
        then you upload, then we finalize and generate the alias.
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
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "inherit",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>PDF file</div>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
            {busy ? "Uploading..." : "Upload"}
          </button>

          {error ? <div style={{ color: "#ff6b6b", fontWeight: 700 }}>{error}</div> : null}
        </div>

        {result ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Done ✅</div>
            <div style={{ opacity: 0.9, marginBottom: 6 }}>
              Alias: <code>{result.alias}</code>
            </div>
            <div style={{ opacity: 0.9 }}>
              Link:{" "}
              <a href={result.view_url} target="_blank" rel="noreferrer">
                {result.view_url}
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
