export type PlatformState =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance";

export type StatusSnapshot = {
  ok: boolean;
  service: string;
  ts: number;
  status?: "ok" | "degraded" | "down";
  error?: string;
};

export function deriveStatusPageScenario(snapshot: StatusSnapshot | null, preview: PlatformState | "live" | "loading"): PlatformState {
  if (preview !== "live" && preview !== "loading") return preview;
  if (!snapshot) return "operational";
  if (snapshot.ok || snapshot.status === "ok") return "operational";
  if (snapshot.status === "degraded") return "degraded";
  if (snapshot.error === "RATE_LIMIT" || snapshot.error === "TIMEOUT") return "degraded";
  return "partial_outage";
}
