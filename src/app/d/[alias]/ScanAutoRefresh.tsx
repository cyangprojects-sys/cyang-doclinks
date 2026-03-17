"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_DELAY_MS = 5000;

export default function ScanAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    };
    const id = window.setTimeout(refreshIfVisible, REFRESH_DELAY_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfVisible();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
