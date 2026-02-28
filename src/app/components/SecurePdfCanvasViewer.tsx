"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectFileFamily, fileFamilyLabel, type FileFamily } from "@/lib/fileFamily";

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<any> };
};

type PageDims = { width: number; height: number };

function PdfPageCanvas({
  doc,
  pageNo,
  scale,
  dims,
}: {
  doc: any;
  pageNo: number;
  scale: number;
  dims: PageDims;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = ref.current;
      if (!canvas || !doc) return;
      const pdfPage = await doc.getPage(pageNo);
      if (cancelled || !canvas) return;
      const viewport = pdfPage.getViewport({ scale });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNo, scale]);

  return <canvas ref={ref} style={{ width: dims.width * scale, height: dims.height * scale }} />;
}

export default function SecurePdfCanvasViewer(props: {
  rawUrl: string;
  downloadUrl?: string;
  mimeType?: string | null;
  filename?: string | null;
  watermarkEnabled?: boolean;
  watermarkText?: string;
  watermarkAssetUrl?: string;
  forensicTag?: string;
  className?: string;
}) {
  const mimeType = String(props.mimeType || "").trim().toLowerCase();
  const mode = useMemo<FileFamily>(
    () => detectFileFamily({ contentType: mimeType, filename: props.filename }),
    [mimeType, props.filename]
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  const [pdfjs, setPdfjs] = useState<PdfJsModule | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState<Record<number, PageDims>>({});
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 1, end: 3 });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  function deter(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 1800);
  }

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
        if (!cancelled && mode === "pdf") setError("Viewer runtime unavailable.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);
    setPageDims({});
    setVisibleRange({ start: 1, end: 3 });
  }, [props.rawUrl, mode]);

  useEffect(() => {
    if (mode !== "pdf" || !pdfjs) return;
    let cancelled = false;
    let localDoc: any = null;
    (async () => {
      try {
        const res = await fetch(props.rawUrl, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/pdf,*/*" },
        });
        if (!res.ok) throw new Error(`Document unavailable (${res.status})`);
        const data = await res.arrayBuffer();
        const task = pdfjs.getDocument({ data });
        localDoc = await task.promise;
        if (cancelled) return;
        setPdfDoc(localDoc);
        const pages = Number(localDoc.numPages || 0);
        setNumPages(pages);
        if (pages > 0) {
          const first = await localDoc.getPage(1);
          const vp = first.getViewport({ scale: 1 });
          setPageDims({ 1: { width: vp.width, height: vp.height } });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Unable to load PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (localDoc?.destroy) void localDoc.destroy();
    };
  }, [mode, pdfjs, props.rawUrl]);

  useEffect(() => {
    if (mode === "image" || mode === "audio" || mode === "video" || mode === "office" || mode === "archive" || mode === "file") {
      setLoading(false);
      setError(null);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "pdf") return;
    const el = scrollRef.current;
    if (!el || numPages <= 0) return;
    const firstDims = pageDims[1] || { width: 800, height: 1100 };
    const rowH = firstDims.height * scale + 24;
    const onScroll = () => {
      const top = el.scrollTop;
      const h = el.clientHeight;
      const start = Math.max(1, Math.floor(top / rowH) - 2);
      const end = Math.min(numPages, Math.ceil((top + h) / rowH) + 2);
      setVisibleRange({ start, end });
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [mode, numPages, pageDims, scale]);

  const watermark = useMemo(() => {
    if (!props.watermarkEnabled) return null;
    const text = (props.watermarkText || "Confidential").trim() || "Confidential";
    const forensic = (props.forensicTag || "").trim();
    const watermarkAsset = String(props.watermarkAssetUrl || "/branding/cyang_watermark.svg").trim();
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          backgroundImage: `url("${watermarkAsset}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "220px 220px",
          opacity: 0.16,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="whitespace-pre-wrap text-center text-3xl font-semibold tracking-widest text-white/20">
            {text}
          </div>
        </div>
        {forensic ? (
          <div className="absolute bottom-2 right-2 rounded border border-white/20 bg-black/55 px-2 py-1 text-[10px] leading-tight text-white/80">
            {forensic}
          </div>
        ) : null}
      </div>
    );
  }, [props.watermarkEnabled, props.watermarkText, props.forensicTag, props.watermarkAssetUrl]);

  const zoomAllowed = mode === "pdf" || mode === "image" || mode === "video";
  const modeLabel = fileFamilyLabel(mode);

  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-black/40 ${props.className || ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        deter("Context actions are disabled for protected viewing.");
      }}
      onKeyDownCapture={(e) => {
        const k = String(e.key || "").toLowerCase();
        const cmd = e.metaKey || e.ctrlKey;
        if ((cmd && (k === "s" || k === "p")) || k === "printscreen") {
          e.preventDefault();
          deter("Export and print shortcuts are disabled.");
        }
      }}
      tabIndex={0}
      role="application"
      aria-label="Secure document viewer"
    >
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-3 py-2 text-xs text-white/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <span>{modeLabel} preview</span>
          {mode === "pdf" ? <span>{numPages ? `${numPages} pages` : ""}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {zoomAllowed ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="relative h-full overflow-auto p-3">
        {loading ? <div className="py-16 text-center text-sm text-white/70">Loading document...</div> : null}
        {error ? <div className="py-16 text-center text-sm text-red-200">{error}</div> : null}
        {!loading && !error ? (
          <div className="relative mx-auto w-fit">
            {mode === "pdf" ? (
              <div className="space-y-6">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => {
                  const dims = pageDims[pageNo] || pageDims[1] || { width: 800, height: 1100 };
                  const shouldRender = pageNo >= visibleRange.start && pageNo <= visibleRange.end;
                  return (
                    <div key={pageNo} className="relative flex justify-center">
                      {shouldRender ? (
                        <PdfPageCanvas doc={pdfDoc} pageNo={pageNo} scale={scale} dims={dims} />
                      ) : (
                        <div
                          className="rounded border border-white/5 bg-white/[0.03]"
                          style={{ width: dims.width * scale, height: dims.height * scale }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {mode === "image" ? (
              <img
                src={props.rawUrl}
                alt="Protected document image"
                className="block max-w-none"
                style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
                draggable={false}
              />
            ) : null}

            {mode === "video" ? (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  src={props.rawUrl}
                  className="block max-w-none bg-black"
                  style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
                  controls={false}
                  controlsList="nodownload noplaybackrate nofullscreen"
                  onLoadedMetadata={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    setVideoReady(true);
                    setVideoDuration(Number.isFinite(v.duration) ? v.duration : 0);
                  }}
                  onTimeUpdate={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    setVideoTime(v.currentTime || 0);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <div className="flex items-center gap-2 text-xs text-white/80">
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 disabled:opacity-40"
                    disabled={!videoReady}
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      if (v.paused) void v.play();
                      else v.pause();
                    }}
                  >
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, videoDuration)}
                    step={0.1}
                    value={Math.min(videoTime, videoDuration || 0)}
                    disabled={!videoReady}
                    onChange={(e) => {
                      const v = videoRef.current;
                      if (!v) return;
                      v.currentTime = Number(e.target.value || 0);
                      setVideoTime(v.currentTime || 0);
                    }}
                    className="w-64"
                  />
                  <span>
                    {Math.floor(videoTime)}s / {Math.floor(videoDuration)}s
                  </span>
                </div>
              </div>
            ) : null}

            {mode === "audio" ? (
              <audio src={props.rawUrl} className="block w-full min-w-[340px]" controls controlsList="nodownload noplaybackrate" />
            ) : null}

            {mode === "office" || mode === "file" ? (
              <div className="w-[min(1100px,92vw)] rounded-xl border border-white/10 bg-black/30 p-3">
                <iframe
                  title={`${modeLabel} preview`}
                  src={props.rawUrl}
                  className="h-[78vh] w-full rounded border border-white/10 bg-black"
                  referrerPolicy="no-referrer"
                  sandbox="allow-same-origin allow-scripts"
                />
                <div className="mt-2 text-xs text-white/60">
                  Rendering depends on browser support for this file type.
                </div>
              </div>
            ) : null}

            {mode === "archive" ? (
              <div className="w-[min(760px,92vw)] rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
                <div className="text-sm font-semibold">Preview not available for archive files.</div>
                <div className="mt-1 text-xs text-amber-100/85">
                  Archive content is download-only and cannot be opened inline.
                </div>
                <div className="mt-3">
                  <a
                    href={props.downloadUrl || props.rawUrl}
                    className="inline-flex items-center rounded-lg border border-amber-200/40 bg-amber-100/10 px-3 py-2 text-sm text-amber-50 hover:bg-amber-100/20"
                  >
                    Download archive
                  </a>
                </div>
              </div>
            ) : null}

            {watermark}
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-30 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-2 text-xs text-red-100">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
