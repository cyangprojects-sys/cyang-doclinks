// src/app/admin/dashboard/UploadPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PresignResponse =
  | {
      ok: true;
      doc_id: string;
      upload_url: string;
      r2_key: string;
      bucket: string;
      expires_in: number;
      encryption: { enabled: true; alg: string | null; iv_b64: string | null; data_key_b64: string | null };
    }
  | { ok: false; error: string; message?: string };

type CompleteResponse =
  | { ok: true; doc_id: string; alias: string; view_url: string; target_url?: string }
  | { ok: false; error: string; message?: string };

type KeyStatusResponse =
  | { ok: true; configured: boolean; active_key_id: string | null; revoked_active: boolean }
  | { ok: false; error: string; message?: string };

function fmtBytes(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function b64ToU8(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export default function UploadPanel({
  canCheckEncryptionStatus,
}: {
  canCheckEncryptionStatus: boolean;
}) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [docId, setDocId] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  const [encryptionReady, setEncryptionReady] = useState<boolean | null>(null);
  const [encryptionMsg, setEncryptionMsg] = useState<string | null>(null);

  const fileLabel = useMemo(() => {
    if (!file) return "Choose a PDF…";
    return `${file.name} (${fmtBytes(file.size)})`;
  }, [file]);

  useEffect(() => {
    if (!canCheckEncryptionStatus) {
      // Don't render encryption status for non-owner accounts.
      setEncryptionReady(null);
      setEncryptionMsg(null);
      return;
    }

    let cancelled = false;

    async function loadKeyStatus() {
      try {
        const r = await fetch("/api/admin/security/keys", { method: "GET" });
        const j = (await r.json().catch(() => null)) as KeyStatusResponse | null;
        if (cancelled) return;

        if (!r.ok || !j || j.ok !== true) {
          setEncryptionReady(false);
          setEncryptionMsg("Encryption status unavailable.");
          return;
        }

        if (!j.configured || j.revoked_active) {
          setEncryptionReady(false);
          setEncryptionMsg(
            !j.configured
              ? "Missing DOC_MASTER_KEYS"
              : "Active master key is revoked (rotate to a new key)."
          );
          return;
        }

        setEncryptionReady(true);
        setEncryptionMsg(null);
      } catch {
        if (cancelled) return;
        setEncryptionReady(false);
        setEncryptionMsg("Encryption status unavailable.");
      }
    }

    loadKeyStatus();
    return () => {
      cancelled = true;
    };
  }, [canCheckEncryptionStatus]);

  async function onUpload() {
    setError(null);
    setDocId(null);
    setViewUrl(null);

    if (encryptionReady === false) {
      setError(encryptionMsg || "Encryption is not configured.");
      return;
    }

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
      // 1) Presign (encryption is mandatory)
      const presignRes = await fetch("/api/admin/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title || file.name,
          filename: file.name,
          contentType: "application/pdf",
          sizeBytes: file.size,
          encrypt: true,
        }),
      });

      const presignJson = (await presignRes.json().catch(() => null)) as PresignResponse | null;
      if (!presignRes.ok || !presignJson || presignJson.ok !== true) {
        const msg =
          (presignJson as any)?.message ||
          (presignJson as any)?.error ||
          `Init failed (${presignRes.status})`;
        throw new Error(msg);
      }

      const enc = presignJson.encryption as any;
      if (!enc?.enabled || !enc?.data_key_b64 || !enc?.iv_b64) {
        throw new Error("Server did not provide encryption parameters.");
      }

      // 2) Client-side encryption (AES-256-GCM)
      const keyBytes = b64ToU8(enc.data_key_b64);
      const ivBytes = b64ToU8(enc.iv_b64);

      const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
      const plain = await file.arrayBuffer();
      const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, cryptoKey, plain);

      const putBody = new Blob([new Uint8Array(cipher)], { type: "application/octet-stream" });

      // 3) PUT to R2
      const putRes = await fetch(presignJson.upload_url, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          // These two headers are part of the presigned request.
          // They allow the server to verify object provenance during /complete.
          "x-amz-meta-doc-id": presignJson.doc_id,
          "x-amz-meta-orig-content-type": "application/pdf",
        },
        body: putBody,
      });

      if (!putRes.ok) {
        const txt = await putRes.text().catch(() => "");
        throw new Error(`R2 upload failed (${putRes.status})${txt ? `: ${txt}` : ""}`);
      }

      // 4) Complete
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
      if (!completeRes.ok || !completeJson || completeJson.ok !== true) {
        const msg =
          (completeJson as any)?.message ||
          (completeJson as any)?.error ||
          `Finalize failed (${completeRes.status})`;
        throw new Error(msg);
      }

      setDocId(completeJson.doc_id);
      setViewUrl(completeJson.view_url);

      setTitle("");
      setFile(null);

      router.refresh();
    
} catch (e: any) {
  // When R2 bucket CORS is not configured (or the presigned PUT preflight is blocked),
  // browsers throw a generic network error (often "Failed to fetch" / "NetworkError").
  const msg = String(e?.message ?? "");
  const name = String(e?.name ?? "");
  const looksLikeCors =
    name === "TypeError" ||
    /Failed to fetch/i.test(msg) ||
    /NetworkError/i.test(msg) ||
    /CORS/i.test(msg) ||
    /blocked/i.test(msg);

  if (looksLikeCors) {
    setError(
      [
        "Upload failed due to a browser CORS/network block when PUT-ing to Cloudflare R2.",
        "",
        "Fix: add a CORS rule on your R2 bucket to allow PUT from https://www.cyang.io (and your preview domains),",
        "and allow headers: content-type, x-amz-meta-doc-id, x-amz-meta-orig-content-type (or simply allow all headers).",
        "",
        "See: scripts/r2/CORS_SETUP.md in this repo.",
      ].join("
")
    );
  } else {
    setError(msg || "Upload failed.");
  }
} finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Upload document</h2>
          <p className="mt-1 text-sm text-white/60">
            Direct-to-R2 signed PUT. Creates doc row first, then finalizes and generates alias.
          </p>
        </div>

        <button
          onClick={onUpload}
          disabled={busy || !file || encryptionReady === false}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-white/70">Title (optional)</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Shown in admin list / emails"
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/20"
          />
        </div>

        <div>
          <div className="text-xs font-medium text-white/70">PDF file</div>
          <label className="mt-1 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm hover:border-white/20">
            <span className="truncate text-white/80">{fileLabel}</span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold">Browse…</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-emerald-400/10 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200/90">
        🔐 Documents are encrypted end-to-end (AES-256-GCM). The server only decrypts when serving.
      </div>

      {canCheckEncryptionStatus && encryptionReady === false && (
        <div className="mt-2 text-sm text-red-300">
          {encryptionMsg ?? "Encryption not configured."}
        </div>
      )}

      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}

      {docId && viewUrl && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm">
          <div className="text-xs text-white/50">Uploaded</div>
          <div className="mt-1 font-mono text-xs text-white/70">{docId}</div>
          <a className="mt-2 inline-block text-sm text-sky-300 hover:underline" href={viewUrl}>
            {viewUrl}
          </a>
        </div>
      )}
    </div>
  );
}
