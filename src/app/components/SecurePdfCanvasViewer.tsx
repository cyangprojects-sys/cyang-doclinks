"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<any> };
};

export default function SecurePdfCanvasViewer(props: {
  rawUrl: string;
  watermarkEnabled?: boolean;
  watermarkText?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfJsModule | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
        if (cancelled) return;
        lib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        setPdfjs(lib);
      } catch {
        if (cancelled) return;
        setError("Viewer runtime unavailable.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pdfjs) return;
    let cancelled = false;
    let localDoc: any = null;
    setLoading(true);
    setError(null);
    setDoc(null);
    setNumPages(0);
    setPage(1);

    (async () => {
      try {
        const res = await fetch(props.rawUrl, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/pdf,*/*" },
        });
        if (!res.ok) {
          throw new Error(`Document unavailable (${res.status})`);
        }
        const data = await res.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data });
        localDoc = await loadingTask.promise;
        if (cancelled) return;
        setDoc(localDoc);
        setNumPages(Number(localDoc.numPages || 0));
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Unable to load document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (localDoc?.destroy) {
        void localDoc.destroy();
      }
    };
  }, [pdfjs, props.rawUrl]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled || !canvasRef.current) return;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        if (!cancelled) setError("Unable to render this page.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, scale]);

  function deterrence(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 1800);
  }

  const watermark = useMemo(() => {
    if (!props.watermarkEnabled) return null;
    const text = (props.watermarkText || "Confidential").trim() || "Confidential";
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -35deg,
            rgba(255,255,255,0.08) 0px,
            rgba(255,255,255,0.08) 2px,
            rgba(0,0,0,0) 2px,
            rgba(0,0,0,0) 140px
          )`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="whitespace-pre-wrap text-center text-3xl font-semibold tracking-widest text-white/20">
            {text}
          </div>
        </div>
      </div>
    );
  }, [props.watermarkEnabled, props.watermarkText]);

  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-black/40 ${props.className || ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        deterrence("Context actions are disabled for protected viewing.");
      }}
      onKeyDownCapture={(e) => {
        const k = String(e.key || "").toLowerCase();
        const cmd = e.metaKey || e.ctrlKey;
        if ((cmd && (k === "s" || k === "p")) || k === "printscreen") {
          e.preventDefault();
          deterrence("Export and print shortcuts are disabled.");
        }
      }}
      tabIndex={0}
      role="application"
      aria-label="Secure document viewer"
    >
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-3 py-2 text-xs text-white/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 disabled:opacity-40"
            disabled={loading || !!error || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 disabled:opacity-40"
            disabled={loading || !!error || page >= numPages}
            onClick={() => setPage((p) => Math.min(numPages || 1, p + 1))}
          >
            Next
          </button>
          <span>
            Page {numPages ? page : "-"} / {numPages || "-"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 disabled:opacity-40"
            disabled={loading || !!error}
            onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.1).toFixed(2))))}
          >
            -
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 disabled:opacity-40"
            disabled={loading || !!error}
            onClick={() => setScale((s) => Math.min(2.2, Number((s + 0.1).toFixed(2))))}
          >
            +
          </button>
        </div>
      </div>

      <div className="relative overflow-auto p-3">
        {loading ? <div className="py-16 text-center text-sm text-white/70">Loading document...</div> : null}
        {error ? <div className="py-16 text-center text-sm text-red-200">{error}</div> : null}
        <div className="relative mx-auto w-fit">
          <canvas ref={canvasRef} className={loading || !!error ? "hidden" : "block"} />
          {watermark}
        </div>
      </div>

      {notice ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-30 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-2 text-xs text-red-100">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

