"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PublicFunnelTracker = dynamic(() => import("./PublicFunnelTracker"), {
  ssr: false,
});

export default function PublicFunnelTrackerDeferred() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setEnabled(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!enabled) return null;
  return <PublicFunnelTracker />;
}
