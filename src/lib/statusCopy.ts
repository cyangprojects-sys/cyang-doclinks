export type StatusCopyState =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance";

export function platformStatusSummary(state: StatusCopyState): string {
  if (state === "degraded") return "Some services are slower than normal. Core availability remains intact.";
  if (state === "partial_outage") return "A subset of services is currently unavailable and mitigation is in progress.";
  if (state === "major_outage") return "Multiple core workflows are impacted. Incident response is active.";
  if (state === "maintenance") return "Planned maintenance is in progress and some operations may be delayed.";
  return "All core systems are operating normally.";
}
