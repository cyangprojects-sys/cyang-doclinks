import { logSecurityEvent } from "@/lib/securityTelemetry";

export async function logCronRun(args: {
  job: string;
  ok: boolean;
  durationMs: number;
  meta?: Record<string, unknown> | null;
}) {
  const job = String(args.job || "").trim();
  if (!job) return;

  await logSecurityEvent({
    type: args.ok ? "cron_run_ok" : "cron_run_failed",
    severity: args.ok ? "low" : "high",
    scope: `cron:${job}`,
    message: args.ok ? "Cron run completed" : "Cron run failed",
    meta: {
      job,
      durationMs: Math.max(0, Math.floor(Number(args.durationMs || 0))),
      ...(args.meta ?? {}),
    },
  });
}
