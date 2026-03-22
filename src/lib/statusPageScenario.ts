export type PlatformState =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance";

export type StatusPageScenario = PlatformState | "snapshot_unavailable";

export type StatusSnapshot = {
  ok: boolean;
  service: string;
  ts: number | null;
  status?: "ok" | "degraded" | "down";
  error?: string;
};

const PUBLIC_SNAPSHOT_STALE_MS = 20 * 60_000;

export function hasFreshStatusSnapshot(snapshot: StatusSnapshot | null, now = Date.now()): boolean {
  if (!snapshot) return false;
  if (typeof snapshot.ts !== "number" || !Number.isFinite(snapshot.ts) || snapshot.ts <= 0) return false;
  if (now - snapshot.ts > PUBLIC_SNAPSHOT_STALE_MS) return false;
  return true;
}

export function deriveStatusPageScenario(
  snapshot: StatusSnapshot | null,
  preview: PlatformState | "live" | "loading"
): StatusPageScenario {
  if (preview !== "live" && preview !== "loading") return preview;
  if (!snapshot) return "snapshot_unavailable";
  if (!hasFreshStatusSnapshot(snapshot)) return "snapshot_unavailable";
  const liveSnapshot = snapshot;
  if (!liveSnapshot.status && !liveSnapshot.ok) return "snapshot_unavailable";
  if (liveSnapshot.error && !liveSnapshot.status) return "snapshot_unavailable";
  if (liveSnapshot.ok || liveSnapshot.status === "ok") return "operational";
  if (liveSnapshot.status === "degraded") return "degraded";
  if (liveSnapshot.error === "RATE_LIMIT" || liveSnapshot.error === "TIMEOUT" || liveSnapshot.error === "NETWORK") {
    return "snapshot_unavailable";
  }
  return "partial_outage";
}
