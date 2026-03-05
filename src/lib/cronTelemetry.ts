import { logSecurityEvent } from "@/lib/securityTelemetry";

const MAX_JOB_LEN = 64;
const MAX_META_ENTRIES = 32;
const MAX_META_KEY_LEN = 64;
const MAX_META_STRING_LEN = 256;

function sanitizeMeta(input: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  const entries = Object.entries(input).slice(0, MAX_META_ENTRIES);
  for (const [k, v] of entries) {
    const key = String(k || "").trim().slice(0, MAX_META_KEY_LEN);
    if (!key) continue;
    out[key] = typeof v === "string" ? v.slice(0, MAX_META_STRING_LEN) : v;
  }
  return Object.keys(out).length ? out : null;
}

export async function logCronRun(args: {
  job: string;
  ok: boolean;
  durationMs: number;
  meta?: Record<string, unknown> | null;
}) {
  const job = String(args.job || "").trim().slice(0, MAX_JOB_LEN);
  if (!job) return;
  const durationMs = Number.isFinite(args.durationMs) ? Math.max(0, Math.min(3_600_000, Math.floor(args.durationMs))) : 0;
  const meta = sanitizeMeta(args.meta ?? null);

  await logSecurityEvent({
    type: args.ok ? "cron_run_ok" : "cron_run_failed",
    severity: args.ok ? "low" : "high",
    scope: `cron:${job}`,
    message: args.ok ? "Cron run completed" : "Cron run failed",
    meta: {
      job,
      durationMs,
      ...(meta ?? {}),
    },
  });
}
