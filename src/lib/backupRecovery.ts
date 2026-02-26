import { sql } from "@/lib/db";

function boolEnv(name: string, fallback = false): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (!v) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(v);
}

async function pingBackupWebhook(url: string): Promise<{ ok: boolean; status: number; body?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ at: new Date().toISOString(), source: "cyang-doclinks" }),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: text.slice(0, 400) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: msg };
  }
}

export async function runBackupRecoveryCheck() {
  const enabled = boolEnv("BACKUP_AUTOMATION_ENABLED", false);
  if (!enabled) return { enabled: false, ran: false };

  const maxAgeHours = Math.max(1, Number(process.env.BACKUP_MAX_AGE_HOURS || 30));
  const webhook = String(process.env.BACKUP_WEBHOOK_URL || "").trim();

  let backupOk = false;
  let backupStatus = "skipped";
  let backupMeta: Record<string, unknown> = {};

  if (webhook) {
    const ping = await pingBackupWebhook(webhook);
    backupOk = ping.ok;
    backupStatus = ping.ok ? "ok" : "failed";
    backupMeta = { status: ping.status, response: ping.body ?? "" };
  } else {
    backupOk = true;
    backupStatus = "skipped";
    backupMeta = { reason: "BACKUP_WEBHOOK_URL is not set" };
  }

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

  const recoveryDrillDays = Math.max(1, Number(process.env.RECOVERY_DRILL_DAYS || 30));
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
