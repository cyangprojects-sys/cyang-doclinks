import { sql } from "@/lib/db";

function parsePositiveInt(raw: unknown, fallback: number, min = 1, max = 3650): number {
  const rawInput = String(raw ?? "");
  if (rawInput.length > 24 || /[\r\n\0]/.test(rawInput)) return fallback;
  const n = Number(rawInput);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseTruthy(raw: unknown): boolean {
  const rawInput = String(raw ?? "");
  if (/[\r\n\0]/.test(rawInput)) return false;
  const v = rawInput.trim().toLowerCase();
  if (!v || v.length > 16) return false;
  return ["1", "true", "yes", "y", "on"].includes(v);
}

function normalizeWebhookUrl(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 2048 || /[\r\n\0]/.test(value)) return "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  if (parsed.username || parsed.password) return "";
  return parsed.toString();
}

export function parseBackupRecoveryConfig(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  maxAgeHours: number;
  recoveryDrillDays: number;
  webhook: string;
} {
  const enabled = parseTruthy(env.BACKUP_AUTOMATION_ENABLED);
  const maxAgeHours = parsePositiveInt(env.BACKUP_MAX_AGE_HOURS, 30, 1, 24 * 365);
  const recoveryDrillDays = parsePositiveInt(env.RECOVERY_DRILL_DAYS, 30, 1, 3650);
  const webhook = normalizeWebhookUrl(env.BACKUP_WEBHOOK_URL);
  return { enabled, maxAgeHours, recoveryDrillDays, webhook };
}

async function pingBackupWebhook(url: string): Promise<{ ok: boolean; status: number; body?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ at: new Date().toISOString(), source: "cyang-doclinks" }),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: text.slice(0, 400) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: msg };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runBackupRecoveryCheck() {
  const { enabled, maxAgeHours, recoveryDrillDays, webhook } = parseBackupRecoveryConfig();
  if (!enabled) return { enabled: false, ran: false };

  // If automation is enabled but no webhook is configured, do not emit
  // synthetic "skipped" runs. This keeps backup health driven by real backup
  // outcomes (for example GitHub backup status webhooks).
  if (!webhook) {
    return {
      enabled: true,
      ran: false,
      backupOk: null,
      backupStatus: "not_configured",
      maxAgeHours,
      hoursSinceLastSuccess: null,
      freshnessOk: false,
      recoveryDrillDays,
      recoveryDrillDue: true,
      backupMeta: { reason: "BACKUP_WEBHOOK_URL is not set" },
    };
  }

  let backupOk = false;
  let backupStatus = "failed";
  let backupMeta: Record<string, unknown> = {};

  const ping = await pingBackupWebhook(webhook);
  backupOk = ping.ok;
  backupStatus = ping.ok ? "ok" : "failed";
  backupMeta = { status: ping.status, response: ping.body ?? "" };

  try {
    await sql`
      insert into public.backup_runs (status, details)
      values (${backupStatus}, ${JSON.stringify(backupMeta)}::jsonb)
    `;
  } catch {
    // best-effort
  }

  let freshnessOk = false;
  let hoursSinceLast = null as number | null;
  try {
    const rows = (await sql`
      select
        extract(epoch from (now() - max(created_at))) / 3600.0 as hours_since
      from public.backup_runs
      where status in ('ok', 'success')
    `) as unknown as Array<{ hours_since: number | string | null }>;
    const h = rows?.[0]?.hours_since;
    hoursSinceLast = h == null ? null : Number(h);
    freshnessOk = hoursSinceLast != null && Number.isFinite(hoursSinceLast) && hoursSinceLast <= maxAgeHours;
  } catch {
    freshnessOk = false;
  }

  let recoveryDrillDue = false;
  try {
    const rows = (await sql`
      select
        extract(epoch from (now() - max(ran_at))) / 86400.0 as days_since
      from public.recovery_drills
      where status = 'success'
    `) as unknown as Array<{ days_since: number | string | null }>;
    const d = rows?.[0]?.days_since;
    const daysSince = d == null ? Number.POSITIVE_INFINITY : Number(d);
    recoveryDrillDue = !Number.isFinite(daysSince) || daysSince >= recoveryDrillDays;
  } catch {
    recoveryDrillDue = true;
  }

  return {
    enabled: true,
    ran: true,
    backupOk,
    backupStatus,
    maxAgeHours,
    hoursSinceLastSuccess: hoursSinceLast,
    freshnessOk,
    recoveryDrillDays,
    recoveryDrillDue,
    backupMeta,
  };
}
