"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_DELAY_MS = 5000;

export default function ScanAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      router.refresh();
    }, REFRESH_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [router]);

  return null;
}
