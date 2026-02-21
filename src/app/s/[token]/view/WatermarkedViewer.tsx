"use client";

import { useMemo } from "react";

export default function WatermarkedViewer(props: {
  rawUrl: string;
  enabled: boolean;
  text: string;
}) {
  const text = (props.text || "").trim();

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
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      <iframe
        title="Document"
        src={props.rawUrl}
        className="h-full w-full"
        // lock down iframe a bit; pdf viewer still needs basic permissions
        sandbox="allow-same-origin allow-scripts allow-downloads"
      />
      {overlay}
    </div>
  );
}
