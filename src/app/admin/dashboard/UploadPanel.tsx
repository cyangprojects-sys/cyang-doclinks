"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type UploadItem = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  message?: string;
  viewUrl?: string;
  docId?: string;
};

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [encryptionReady, setEncryptionReady] = useState<boolean | null>(null);
  const [encryptionMsg, setEncryptionMsg] = useState<string | null>(null);
  const inputId = "upload-panel-file-input";

  const queuedCount = useMemo(() => items.filter((i) => i.status === "queued").length, [items]);
  const doneCount = useMemo(() => items.filter((i) => i.status === "done").length, [items]);
  const errorCount = useMemo(() => items.filter((i) => i.status === "error").length, [items]);

  useEffect(() => {
    if (!canCheckEncryptionStatus) {
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
          setEncryptionMsg(!j.configured ? "Missing DOC_MASTER_KEYS" : "Active master key is revoked (rotate to a new key).");
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

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files || []);
    const onlyPdf = arr.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (arr.length && !onlyPdf.length) {
      setError("Only PDF files are allowed.");
      return;
    }
    if (!onlyPdf.length) return;
    setError(null);
    setItems((prev) => [
      ...prev,
      ...onlyPdf.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        status: "queued" as const,
      })),
    ]);
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function uploadOne(item: UploadItem) {
    const file = item.file;
    updateItem(item.id, { status: "uploading", message: undefined });

    const presignRes = await fetch("/api/admin/upload/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: file.name,
        filename: file.name,
        contentType: "application/pdf",
        sizeBytes: file.size,
        encrypt: true,
      }),
    });

    const presignJson = (await presignRes.json().catch(() => null)) as PresignResponse | null;
    if (!presignRes.ok || !presignJson || presignJson.ok !== true) {
      const msg = (presignJson as any)?.message || (presignJson as any)?.error || `Init failed (${presignRes.status})`;
      throw new Error(msg);
    }

    const enc = presignJson.encryption as any;
    if (!enc?.enabled || !enc?.data_key_b64 || !enc?.iv_b64) {
      throw new Error("Server did not provide encryption parameters.");
    }

    const keyBytes = b64ToU8(enc.data_key_b64);
    const ivBytes = b64ToU8(enc.iv_b64);
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const plain = await file.arrayBuffer();
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, cryptoKey, plain);
    const putBody = new Blob([new Uint8Array(cipher)], { type: "application/octet-stream" });

    const putRes = await fetch(presignJson.upload_url, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-amz-meta-doc-id": presignJson.doc_id,
        "x-amz-meta-orig-content-type": "application/pdf",
      },
      body: putBody,
    });
    if (!putRes.ok) {
      const txt = await putRes.text().catch(() => "");
      throw new Error(`R2 upload failed (${putRes.status})${txt ? `: ${txt}` : ""}`);
    }

    const completeRes = await fetch("/api/admin/upload/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        doc_id: presignJson.doc_id,
        title: file.name,
        original_filename: file.name,
        r2_bucket: presignJson.bucket,
        r2_key: presignJson.r2_key,
      }),
    });

    const completeJson = (await completeRes.json().catch(() => null)) as CompleteResponse | null;
    if (!completeRes.ok || !completeJson || completeJson.ok !== true) {
      const msg = (completeJson as any)?.message || (completeJson as any)?.error || `Finalize failed (${completeRes.status})`;
      throw new Error(msg);
    }

    updateItem(item.id, {
      status: "done",
      docId: completeJson.doc_id,
      viewUrl: completeJson.view_url,
    });
  }

  async function onUploadAll() {
    setError(null);
    if (encryptionReady === false) {
      setError(encryptionMsg || "Encryption is not configured.");
      return;
    }
    if (!items.some((i) => i.status === "queued")) {
      setError("Add at least one PDF first.");
      return;
    }

    setBusy(true);
    try {
      const queue = items.filter((i) => i.status === "queued");
      for (const item of queue) {
        try {
          await uploadOne(item);
        } catch (e: any) {
          updateItem(item.id, { status: "error", message: e?.message || "Upload failed." });
        }
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Upload documents</h2>
          <p className="mt-1 text-sm text-white/60">
            Drag and drop one or many PDFs. Document title is automatically set from filename.
          </p>
        </div>

        <button
          onClick={onUploadAll}
          disabled={busy || queuedCount === 0 || encryptionReady === false}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? "Uploading..." : `Upload${queuedCount > 0 ? ` (${queuedCount})` : ""}`}
        </button>
      </div>

      <div className="mt-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload PDF files"
          aria-describedby="upload-dropzone-help"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragOver ? "border-sky-300 bg-sky-500/10" : "border-white/20 bg-black/30 hover:border-white/40"
          }`}
        >
          <div className="text-sm font-medium text-white">Drop PDF files here</div>
          <div id="upload-dropzone-help" className="mt-1 text-xs text-white/60">or click to browse multiple files</div>
          <input
            id={inputId}
            ref={fileInputRef}
            type="file"
            aria-label="Choose PDF files to upload"
            multiple
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-emerald-400/10 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200/90">
        Documents are encrypted end-to-end (AES-256-GCM). The server only decrypts when serving.
      </div>

      {canCheckEncryptionStatus && encryptionReady === false && (
        <div role="status" aria-live="polite" className="mt-2 text-sm text-red-300">{encryptionMsg ?? "Encryption not configured."}</div>
      )}

      {error && <div role="alert" aria-live="assertive" className="mt-3 text-sm text-red-300">{error}</div>}

      {items.length > 0 ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-white/60">
            <span>Total: {items.length}</span>
            <span>Done: {doneCount}</span>
            <span>Errors: {errorCount}</span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-white/50">
                <tr>
                  <th className="py-1 pr-2">File</th>
                  <th className="py-1 pr-2">Size</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-white/10">
                    <td className="py-2 pr-2 text-white/85">{item.file.name}</td>
                    <td className="py-2 pr-2 text-white/60">{fmtBytes(item.file.size)}</td>
                    <td className="py-2 pr-2">
                      {item.status === "done"
                        ? "Done"
                        : item.status === "error"
                          ? "Error"
                          : item.status === "uploading"
                            ? "Uploading..."
                            : "Queued"}
                    </td>
                    <td className="py-2 pr-2 text-white/70">
                      {item.status === "error" ? (
                        <span className="text-red-300">{item.message || "Upload failed"}</span>
                      ) : item.viewUrl ? (
                        <a href={item.viewUrl} className="text-sky-300 hover:underline">
                          Open
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
