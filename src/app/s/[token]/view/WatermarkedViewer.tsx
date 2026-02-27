"use client";

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export default function WatermarkedViewer(props: {
  rawUrl: string;
  enabled: boolean;
  text: string;
}) {
  const text = (props.text || "").trim();
  const [deterrenceNotice, setDeterrenceNotice] = useState<string | null>(null);
  const [shield, setShield] = useState(false);

  useEffect(() => {
    if (!props.enabled) return;
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
    let shieldTimer: ReturnType<typeof setTimeout> | null = null;

    const notify = (msg: string, showShield: boolean) => {
      setDeterrenceNotice(msg);
      if (showShield) setShield(true);
      if (noticeTimer) clearTimeout(noticeTimer);
      if (shieldTimer) clearTimeout(shieldTimer);
      noticeTimer = setTimeout(() => setDeterrenceNotice(null), 2200);
      if (showShield) {
        shieldTimer = setTimeout(() => setShield(false), 2200);
      }
    };

    const onBeforePrint = (e: Event) => {
      e.preventDefault();
      notify("Printing is disabled for protected viewing.", true);
    };

    const onVisibility = () => {
      if (document.hidden) {
        notify("Recording/screenshot behavior is monitored.", true);
      }
    };

    window.addEventListener("beforeprint", onBeforePrint);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      document.removeEventListener("visibilitychange", onVisibility);
      if (noticeTimer) clearTimeout(noticeTimer);
      if (shieldTimer) clearTimeout(shieldTimer);
    };
  }, [props.enabled]);

  function notify(message: string, showShield: boolean) {
    setDeterrenceNotice(message);
    if (showShield) {
      setShield(true);
      window.setTimeout(() => setShield(false), 2200);
    }
    window.setTimeout(() => setDeterrenceNotice(null), 2200);
  }

  function onProtectedKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const k = String(e.key || "").toLowerCase();
    const cmd = e.metaKey || e.ctrlKey;
    if ((cmd && (k === "p" || k === "s")) || k === "printscreen") {
      e.preventDefault();
      notify("Capture/export is restricted for this document.", true);
    }
  }

  const overlay = useMemo(() => {
    if (!props.enabled) return null;
    const t = text || "Confidential";
    // Light-weight repeating watermark using CSS background.
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -35deg,
            rgba(255,255,255,0.08) 0px,
            rgba(255,255,255,0.08) 2px,
            rgba(0,0,0,0) 2px,
            rgba(0,0,0,0) 160px
          )`,
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: "rotate(-25deg)",
          }}
        >
          <div className="select-none whitespace-pre-wrap text-center text-[32px] font-semibold tracking-widest text-white/20 md:text-[44px]">
            {t}
          </div>
        </div>
      </div>
    );
  }, [props.enabled, text]);

  return (
    <div
      className="relative h-[calc(100vh-64px)] w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
      role="application"
      tabIndex={0}
      aria-label="Protected document viewer"
      onKeyDownCapture={onProtectedKeyDown}
    >
      <iframe
        title="Document"
        src={`${props.rawUrl}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0`}
        className="h-full w-full"
        // Chrome/Edge PDF rendering requires script execution in the embedded viewer.
        // Without allow-scripts, some documents show a blank canvas in iframe mode.
        sandbox="allow-same-origin allow-scripts"
        referrerPolicy="no-referrer"
      />
      {overlay}
      {shield ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-black/70 backdrop-blur-[2px]"
        />
      ) : null}
      {deterrenceNotice ? (
        <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs text-red-100">
          {deterrenceNotice}
        </div>
      ) : null}
    </div>
  );
}
