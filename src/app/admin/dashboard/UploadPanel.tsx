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
      upload_headers?: Record<string, string>;
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

function isTerminalStatus(status: UploadItem["status"]): boolean {
  return status === "done" || status === "error";
}

const ALLOWED_EXTS = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "rtf",
  "odt",
  "xls",
  "xlsx",
  "csv",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "heic",
  "zip",
  "rar",
  "mp3",
  "wav",
  "mp4",
  "mov",
  "avi",
]);

const EXECUTABLE_EXTS = new Set([
  "js",
  "mjs",
  "cjs",
  "vbs",
  "vbe",
  "ps1",
  "psm1",
  "py",
  "php",
  "exe",
  "msi",
  "com",
  "scr",
  "dll",
  "sys",
  "lnk",
  "pif",
  "bat",
  "cmd",
  "jar",
  "apk",
  "sh",
  "bin",
  "docm",
  "xlsm",
  "pptm",
  "svg",
]);

const ACCEPT_ATTR =
  ".pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.heic,.zip,.rar,.mp3,.wav,.mp4,.mov,.avi";

function extOf(name: string): string {
  const n = String(name || "").trim().toLowerCase();
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx + 1) : "";
}

function guessMimeFromFilename(name: string): string {
  const ext = extOf(name);
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    heic: "image/heic",
    zip: "application/zip",
    rar: "application/vnd.rar",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
  };
  return map[ext] || "application/octet-stream";
}

function fmtBytes(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
  const allowedTypeSummary =
    "Documents: .pdf, .doc, .docx, .txt, .rtf, .odt | Spreadsheets: .xls, .xlsx, .csv | Presentations: .ppt, .pptx | Images: .jpg, .jpeg, .png, .gif, .bmp, .heic | Archives: .zip, .rar | Audio/Video: .mp3, .wav, .mp4, .mov, .avi";

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
    const allowed = arr.filter((f) => {
      const ext = extOf(f.name);
      if (!ext) return false;
      if (EXECUTABLE_EXTS.has(ext)) return false;
      return ALLOWED_EXTS.has(ext);
    });
    if (arr.length && !allowed.length) {
      setError("Unsupported file type. Executable and macro-enabled file types are blocked by policy.");
      return;
    }
    if (!allowed.length) return;
    setError(null);
    const nextItems = allowed.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      status: "queued" as const,
    }));
    setItems((prev) => {
      const shouldReset = prev.length > 0 && prev.every((i) => isTerminalStatus(i.status));
      return shouldReset ? nextItems : [...prev, ...nextItems];
    });
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function uploadOne(item: UploadItem) {
    const file = item.file;
    updateItem(item.id, { status: "uploading", message: undefined });

    let presignJson: Extract<PresignResponse, { ok: true }> | null = null;

    const abortIfStaged = async () => {
      if (!presignJson?.doc_id) return;
      try {
        await fetch("/api/admin/upload/abort", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ doc_id: presignJson.doc_id }),
        });
      } catch {
        // Best-effort cleanup; upload error is still surfaced to UI.
      }
    };

    try {
    const presignRes = await fetch("/api/admin/upload/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: file.name,
        filename: file.name,
        contentType: file.type || guessMimeFromFilename(file.name),
        sizeBytes: file.size,
        encrypt: true,
      }),
    });

    const presignParsed = (await presignRes.json().catch(() => null)) as PresignResponse | null;
    if (!presignRes.ok || !presignParsed || presignParsed.ok !== true) {
      const msg =
        presignParsed && presignParsed.ok === false
          ? presignParsed.message || presignParsed.error || `Upload initialization failed (${presignRes.status})`
          : `Upload initialization failed (${presignRes.status})`;
      throw new Error(msg);
    }
    presignJson = presignParsed;

    const uploadHeaders: Record<string, string> =
      presignJson.upload_headers && typeof presignJson.upload_headers === "object"
        ? presignJson.upload_headers
        : {
            "content-type": file.type || guessMimeFromFilename(file.name),
            "x-amz-meta-doc-id": presignJson.doc_id,
            "x-amz-meta-orig-content-type": file.type || guessMimeFromFilename(file.name),
            "x-amz-meta-orig-ext": extOf(file.name),
          };

    const putRes = await fetch(presignJson.upload_url, {
      method: "PUT",
      headers: uploadHeaders,
      body: file,
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
      const msg =
        completeJson && completeJson.ok === false
          ? completeJson.message || completeJson.error || `Upload finalization failed (${completeRes.status})`
          : `Upload finalization failed (${completeRes.status})`;
      throw new Error(msg);
    }

    updateItem(item.id, {
      status: "done",
      docId: completeJson.doc_id,
      viewUrl: completeJson.view_url,
    });
    } catch (e) {
      await abortIfStaged();
      throw e;
    }
  }

  async function onUploadAll() {
    setError(null);
    if (encryptionReady === false) {
      setError(encryptionMsg || "Encryption is not configured.");
      return;
    }
    if (!items.some((i) => i.status === "queued")) {
      setError("Select at least one supported file to continue.");
      return;
    }

    setBusy(true);
    try {
      const queue = items.filter((i) => i.status === "queued");
      for (const item of queue) {
        try {
          await uploadOne(item);
        } catch (e: unknown) {
          updateItem(item.id, { status: "error", message: errorMessage(e) || "Upload failed." });
        }
      }
      router.refresh();
    } catch (e: unknown) {
      setError(errorMessage(e) || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Upload Documents</h2>
          <p className="mt-1 text-sm text-white/60">
            Drag and drop one or more supported files. Document title is set from filename by default.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            Allowed types: {allowedTypeSummary}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            Blocked: executable, script, shortcut, and macro-enabled file types (for example .exe, .js, .ps1, .lnk, .docm).
          </p>
        </div>

        <button
          onClick={onUploadAll}
          disabled={busy || queuedCount === 0 || encryptionReady === false}
          className="rounded-lg border border-sky-300/40 bg-gradient-to-r from-sky-500/45 via-cyan-400/40 to-sky-500/45 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_0_24px_rgba(14,165,233,0.45)] transition hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_32px_rgba(34,211,238,0.55)] disabled:border-white/15 disabled:bg-white/10 disabled:text-white/60 disabled:shadow-none disabled:opacity-60"
        >
          {busy ? "Uploading..." : `Upload now${queuedCount > 0 ? ` (${queuedCount})` : ""}`}
        </button>
      </div>

      <div className="mt-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload files"
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
          <div className="text-sm font-medium text-white">Drop files here</div>
          <div id="upload-dropzone-help" className="mt-1 text-xs text-white/60">or click to select files</div>
          <input
            id={inputId}
            ref={fileInputRef}
            type="file"
            aria-label="Choose files to upload"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-emerald-400/10 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200/90">
        Files are encrypted at rest and served only through controlled delivery paths.
      </div>

      {canCheckEncryptionStatus && encryptionReady === false && (
        <div role="status" aria-live="polite" className="mt-2 text-sm text-red-300">{encryptionMsg ?? "Encryption configuration unavailable."}</div>
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
                        <span className="text-red-300">{item.message || "Upload failed."}</span>
                      ) : item.viewUrl ? (
                        <a href={item.viewUrl} className="text-sky-300 hover:underline">
                          Open document
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
