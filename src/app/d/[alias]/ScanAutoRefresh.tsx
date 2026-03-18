"use client";

import { useRouter } from "next/navigation";
import { useConditionalPolling } from "@/hooks/useConditionalPolling";

const REFRESH_DELAY_MS = 5_000;
const MAX_SCAN_REFRESH_MS = 60_000;
const MAX_SCAN_REFRESH_ATTEMPTS = 20;

export default function ScanAutoRefresh() {
  const router = useRouter();

  useConditionalPolling({
    enabled: true,
    getDelayMs: ({ attempt }) => Math.min(REFRESH_DELAY_MS * 2 ** attempt, MAX_SCAN_REFRESH_MS),
    maxAttempts: MAX_SCAN_REFRESH_ATTEMPTS,
    poll: () => {
      // This component only mounts when the alias page already knows a scan/rescan is active.
      // Once the server reports a terminal state, the refreshed tree unmounts this watcher.
      router.refresh();
      return true;
    },
  });

  return null;
}
