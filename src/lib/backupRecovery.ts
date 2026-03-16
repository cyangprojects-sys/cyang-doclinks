import { sql } from "@/lib/db";

export type BackupRecoveryStatusSummary = {
  enabled: boolean;
  tablesReady: boolean;
  lastStatus: "disabled" | "missing" | string;
  maxAgeHours: number;
  recoveryDrillDays: number;
  hoursSinceLastSuccess: number | null;
  freshnessOk: boolean;
  recoveryDrillDue: boolean;
};

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

async function tableExists(name: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${name})::text as reg`) as Array<{ reg: string | null }>;
    return Boolean(rows[0]?.reg);
  } catch {
    return false;
  }
}

export async function getBackupRecoveryStatusSummary(): Promise<BackupRecoveryStatusSummary> {
  const { enabled, maxAgeHours, recoveryDrillDays } = parseBackupRecoveryConfig();
  const backupRunsReady = await tableExists("public.backup_runs");
  const recoveryDrillsReady = await tableExists("public.recovery_drills");

  if (!enabled) {
    return {
      enabled: false,
      tablesReady: backupRunsReady && recoveryDrillsReady,
      lastStatus: "disabled",
      maxAgeHours,
      recoveryDrillDays,
      hoursSinceLastSuccess: null as number | null,
      freshnessOk: false,
      recoveryDrillDue: true,
    };
  }

  if (!backupRunsReady || !recoveryDrillsReady) {
    return {
      enabled: true,
      tablesReady: false,
      lastStatus: "missing",
      maxAgeHours,
      recoveryDrillDays,
      hoursSinceLastSuccess: null as number | null,
      freshnessOk: false,
      recoveryDrillDue: true,
    };
  }

  const backupRows = (await sql`
    select
      (select status::text from public.backup_runs order by created_at desc limit 1) as last_status,
      (
        select extract(epoch from (now() - max(created_at))) / 3600.0
        from public.backup_runs
        where status in ('ok', 'success')
      ) as hours_since_last_success
  `) as Array<{ last_status: string | null; hours_since_last_success: number | string | null }>;

  const recoveryRows = (await sql`
    select
      (
        select extract(epoch from (now() - max(ran_at))) / 86400.0
        from public.recovery_drills
        where status = 'success'
      ) as days_since_last_success
  `) as Array<{ days_since_last_success: number | string | null }>;

  const hoursSinceLastSuccess =
    backupRows[0]?.hours_since_last_success == null ? null : Number(backupRows[0]?.hours_since_last_success);
  const daysSinceRecovery =
    recoveryRows[0]?.days_since_last_success == null ? Number.POSITIVE_INFINITY : Number(recoveryRows[0]?.days_since_last_success);
  const freshnessOk =
    hoursSinceLastSuccess != null && Number.isFinite(hoursSinceLastSuccess) && hoursSinceLastSuccess <= maxAgeHours;
  const recoveryDrillDue = !Number.isFinite(daysSinceRecovery) || daysSinceRecovery >= recoveryDrillDays;

  return {
    enabled: true,
    tablesReady: true,
    lastStatus: String(backupRows[0]?.last_status || "missing"),
    maxAgeHours,
    recoveryDrillDays,
    hoursSinceLastSuccess,
    freshnessOk,
    recoveryDrillDue,
  };
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

  const status = await getBackupRecoveryStatusSummary();

  return {
    enabled: true,
    ran: true,
    backupOk,
    backupStatus,
    maxAgeHours,
    hoursSinceLastSuccess: status.hoursSinceLastSuccess,
    freshnessOk: status.freshnessOk,
    recoveryDrillDays,
    recoveryDrillDue: status.recoveryDrillDue,
    backupMeta,
  };
}
