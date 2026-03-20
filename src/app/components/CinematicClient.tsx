"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ScrollRevealFrame({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.18 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal-frame", visible && "reveal-frame-visible", className)}
      style={{ transitionDelay: `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function BackgroundVideoSection({
  src,
  poster,
  children,
  className,
  contentClassName,
  priority = false,
  mobileVideo = false,
  playbackRate = 0.85,
  overlayClassName,
}: {
  src: string;
  poster: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  priority?: boolean;
  mobileVideo?: boolean;
  playbackRate?: number;
  overlayClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldRenderVideo, setShouldRenderVideo] = useState(priority);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia("(max-width: 767px)").matches;

    if (reduced || (narrow && !mobileVideo)) {
      const frame = window.requestAnimationFrame(() => setShouldRenderVideo(false));
      return () => window.cancelAnimationFrame(frame);
    }

    if (priority) {
      const frame = window.requestAnimationFrame(() => setShouldRenderVideo(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldRenderVideo(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "220px 0px", threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [mobileVideo, priority]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, shouldRenderVideo]);

  return (
    <section
      ref={containerRef}
      className={cn("cinematic-bleed relative isolate overflow-hidden", className)}
      style={{ backgroundImage: `url(${poster})` }}
    >
      <div className="absolute inset-0 bg-cover bg-center opacity-85" style={{ backgroundImage: `url(${poster})` }} />
      {shouldRenderVideo ? (
        <video
          ref={videoRef}
          aria-hidden="true"
          className="cinematic-video absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload={priority ? "metadata" : "none"}
          poster={poster}
        >
          <source src={src} type="video/mp4" />
        </video>
      ) : null}
      <div className={cn("absolute inset-0 cinematic-video-overlay", overlayClassName)} />
      <div className="absolute inset-0 cinematic-video-grain" />
      <div className={cn("relative z-10", contentClassName)}>{children}</div>
    </section>
  );
}
