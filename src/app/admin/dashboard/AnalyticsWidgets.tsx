// src/app/admin/dashboard/AnalyticsWidgets.tsx
import Link from "next/link";
import { sql } from "@/lib/db";
import Sparkline from "@/components/Sparkline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function tableExists(fqTable: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${fqTable})::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

function fmtMinsAgo(iso: string | null): string {
  if (!iso) return "not available";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "not available";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default async function AnalyticsWidgets({ ownerId }: { ownerId?: string; }) {
  const isViewerScoped = Boolean(ownerId);
  const hasDocViews = await tableExists("public.doc_views");
  const hasDocViewDaily = await tableExists("public.doc_view_daily");
  const hasDocs = await tableExists("public.docs");
  const hasShareTokens = await tableExists("public.share_tokens");
  const hasDocAliases = await tableExists("public.doc_aliases");
  const hasSecurityEvents = await tableExists("public.security_events");
  const hasScanJobs = await tableExists("public.malware_scan_jobs");
  const hasBackupRuns = await tableExists("public.backup_runs");

  const ownerFilterDocs = ownerId ? sql`and d.owner_id = ${ownerId}::uuid` : sql``;
  const ownerFilterShares = ownerId ? sql`and st.owner_id = ${ownerId}::uuid` : sql``;

  // --- totals
  let totalViews = 0;
  let views7 = 0;
  let views30 = 0;
  let series30: number[] = new Array(30).fill(0);

  if (hasDocViewDaily && hasDocs) {
    // Total views (all time) is sum over aggregates (best-effort).
    try {
      const rows = (await sql`
        select coalesce(sum(dvd.view_count), 0)::int as total
        from public.doc_view_daily dvd
        join public.docs d on d.id = dvd.doc_id
        where 1=1
          ${ownerFilterDocs}
      `) as unknown as Array<{ total: number }>;
      totalViews = rows?.[0]?.total ?? 0;
    } catch {
      totalViews = 0;
    }

    // 7/30 day sums + 30-day series
    try {
      const rows = (await sql`
        with days as (
          select generate_series(current_date - interval '29 days', current_date, interval '1 day')::date as day
        )
        select
          days.day::text as day,
          coalesce(sum(dvd.view_count), 0)::int as views
        from days
        left join public.doc_view_daily dvd
          on dvd.date = days.day
        left join public.docs d
          on d.id = dvd.doc_id
        where 1=1
          ${ownerId ? sql`and (d.id is null or d.owner_id = ${ownerId}::uuid)` : sql``}
        group by 1
        order by 1 asc
      `) as unknown as Array<{ day: string; views: number }>;

      series30 = rows.map((r) => r.views);
      views30 = series30.reduce((a, b) => a + b, 0);
      views7 = series30.slice(-7).reduce((a, b) => a + b, 0);
    } catch {
      // ignore
    }
  } else if (hasDocViews && hasDocs) {
    // Fallback: compute from raw doc_views table (slower).
    try {
      const rows = (await sql`
        select coalesce(count(v.id), 0)::int as total
        from public.doc_views v
        join public.docs d on d.id = v.doc_id
        where 1=1
          ${ownerFilterDocs}
      `) as unknown as Array<{ total: number }>;
      totalViews = rows?.[0]?.total ?? 0;
    } catch {
      totalViews = 0;
    }

    try {
      const rows = (await sql`
        select
          coalesce(sum(case when v.created_at >= (now() - interval '7 days') then 1 else 0 end), 0)::int as v7,
          coalesce(sum(case when v.created_at >= (now() - interval '30 days') then 1 else 0 end), 0)::int as v30
        from public.doc_views v
        join public.docs d on d.id = v.doc_id
        where 1=1
          ${ownerFilterDocs}
      `) as unknown as Array<{ v7: number; v30: number }>;
      views7 = rows?.[0]?.v7 ?? 0;
      views30 = rows?.[0]?.v30 ?? 0;
    } catch {
      // ignore
    }
  }

  // --- shares
  let activeShares = 0;
  let revokedShares = 0;
  let expiringShares = 0;

  if (hasShareTokens) {
    try {
      const rows = (await sql`
        select
          coalesce(sum(case
            when st.revoked_at is null
             and (st.expires_at is null or st.expires_at > now())
             and (st.max_views is null or st.max_views = 0 or coalesce(st.views_count, 0) < st.max_views)
            then 1 else 0 end), 0)::int as active,
          coalesce(sum(case when st.revoked_at is not null then 1 else 0 end), 0)::int as revoked,
          coalesce(sum(case
            when st.revoked_at is null
             and st.expires_at is not null
             and st.expires_at > now()
             and st.expires_at <= (now() + interval '3 days')
            then 1 else 0 end), 0)::int as expiring
        from public.share_tokens st
        where 1=1
          ${ownerFilterShares}
      `) as unknown as Array<{ active: number; revoked: number; expiring: number }>;

      activeShares = rows?.[0]?.active ?? 0;
      revokedShares = rows?.[0]?.revoked ?? 0;
      expiringShares = rows?.[0]?.expiring ?? 0;
    } catch {
      // ignore
    }
  }

  // --- aliases expiring (optional extra signal)
  let expiringAliases = 0;
  if (hasDocAliases && hasDocs) {
    try {
      const rows = (await sql`
        select coalesce(count(*), 0)::int as n
        from public.doc_aliases da
        join public.docs d on d.id = da.doc_id
        where da.revoked_at is null
          and coalesce(da.is_active, true) = true
          and da.expires_at is not null
          and da.expires_at > now()
          and da.expires_at <= (now() + interval '3 days')
          ${ownerFilterDocs}
      `) as unknown as Array<{ n: number }>;
      expiringAliases = rows?.[0]?.n ?? 0;
    } catch {
      // ignore
    }
  }

  // --- top docs (last 30 days)
  type TopDoc = { doc_id: string; doc_title: string | null; views_30: number };
  let topDocs: TopDoc[] = [];

  if (hasDocViewDaily && hasDocs) {
    try {
      topDocs = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as doc_title,
          coalesce(sum(dvd.view_count), 0)::int as views_30
        from public.docs d
        left join public.doc_view_daily dvd
          on dvd.doc_id = d.id
         and dvd.date >= (current_date - interval '29 days')
        where 1=1
          ${ownerFilterDocs}
        group by 1,2
        order by views_30 desc, d.created_at desc
        limit 5
      `) as unknown as TopDoc[];
    } catch {
      topDocs = [];
    }
  } else if (hasDocViews && hasDocs) {
    try {
      topDocs = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as doc_title,
          coalesce(count(v.id), 0)::int as views_30
        from public.docs d
        left join public.doc_views v
          on v.doc_id = d.id
         and v.created_at >= (now() - interval '30 days')
        where 1=1
          ${ownerFilterDocs}
        group by 1,2
        order by views_30 desc, d.created_at desc
        limit 5
      `) as unknown as TopDoc[];
    } catch {
      topDocs = [];
    }
  }

  // --- security operations snapshot
  let scanFailures24h = 0;
  let deadLetterAlerts24h = 0;
  let presignErrors24h = 0;
  let abuseSpikes24h = 0;
  let deadLetterBacklog = 0;
  let cronRuns24h = 0;
  let cronFailures24h = 0;
  let cronFreshHealthy = 0;
  let cronFreshTotal = 0;
  let backupLastStatus: string | null = null;
  let backupLastCreatedAt: string | null = null;
  let backupRunCount = 0;
  let backupHoursSinceLastSuccess: number | null = null;
  let backupFreshOk = false;
  let backupUsesGithubReporting = false;
  let topSecurityTypes: Array<{ type: string; c: number }> = [];
  let unencryptedDocs = 0;
  let encryptedMissingKeyVersion = 0;
  let lastSecurityEventAt: string | null = null;
  let nightlyLastOkAt: string | null = null;
  const backupAutomationEnabled = ["1", "true", "yes", "y", "on"].includes(
    String(process.env.BACKUP_AUTOMATION_ENABLED || "").trim().toLowerCase()
  );
  const backupWebhookConfigured = String(process.env.BACKUP_WEBHOOK_URL || "").trim().length > 0;
  const backupStatusWebhookTokenConfigured = String(process.env.BACKUP_STATUS_WEBHOOK_TOKEN || "").trim().length > 0;
  const backupMaxAgeHoursRaw = Number(process.env.BACKUP_MAX_AGE_HOURS || 30);
  const backupMaxAgeHours =
    Number.isFinite(backupMaxAgeHoursRaw) && backupMaxAgeHoursRaw > 0
      ? Math.floor(backupMaxAgeHoursRaw)
      : 30;

  if (hasSecurityEvents) {
    try {
      const rows = (await sql`
        select max(se.created_at)::text as last_at
        from public.security_events se
      `) as unknown as Array<{ last_at: string | null }>;
      lastSecurityEventAt = rows?.[0]?.last_at ?? null;
    } catch {
      // ignore
    }

    try {
      const rows = (await sql`
        select
          coalesce(sum(case when se.type = 'malware_scan_job_failed' then 1 else 0 end), 0)::int as scan_failures,
          coalesce(sum(case when se.type in ('malware_scan_dead_letter', 'malware_scan_dead_letter_backlog') then 1 else 0 end), 0)::int as dead_letter_alerts,
          coalesce(sum(case when se.type = 'upload_presign_error' then 1 else 0 end), 0)::int as presign_errors,
          coalesce(sum(case when se.type = 'abuse_report_spike' then 1 else 0 end), 0)::int as abuse_spikes
        from public.security_events se
        where se.created_at > now() - interval '24 hours'
          ${ownerId
            ? sql`and (
                se.actor_user_id = ${ownerId}::uuid
                or exists (
                  select 1 from public.docs d
                  where d.id = se.doc_id
                    and d.owner_id = ${ownerId}::uuid
                )
              )`
            : sql``}
      `) as unknown as Array<{
        scan_failures: number;
        dead_letter_alerts: number;
        presign_errors: number;
        abuse_spikes: number;
      }>;

      scanFailures24h = Number(rows?.[0]?.scan_failures ?? 0);
      deadLetterAlerts24h = Number(rows?.[0]?.dead_letter_alerts ?? 0);
      presignErrors24h = Number(rows?.[0]?.presign_errors ?? 0);
      abuseSpikes24h = Number(rows?.[0]?.abuse_spikes ?? 0);
    } catch {
      // ignore
    }

    try {
      const rows = (await sql`
        select
          coalesce(sum(case when se.type in ('cron_run_ok','cron_run_failed') then 1 else 0 end), 0)::int as runs,
          coalesce(sum(case when se.type = 'cron_run_failed' then 1 else 0 end), 0)::int as failures
        from public.security_events se
        where se.created_at > now() - interval '24 hours'
          ${ownerId
            ? sql`and (se.actor_user_id = ${ownerId}::uuid or se.actor_user_id is null)`
            : sql``}
      `) as unknown as Array<{ runs: number; failures: number }>;
      cronRuns24h = Number(rows?.[0]?.runs ?? 0);
      cronFailures24h = Number(rows?.[0]?.failures ?? 0);
    } catch {
      // ignore
    }

    try {
      topSecurityTypes = (await sql`
        select
          se.type::text as type,
          count(*)::int as c
        from public.security_events se
        where se.created_at > now() - interval '24 hours'
        group by se.type
        order by c desc, se.type asc
        limit 5
      `) as unknown as Array<{ type: string; c: number }>;
    } catch {
      topSecurityTypes = [];
    }
  }

  if (hasSecurityEvents) {
    try {
      const expectedJobs = ["webhooks", "scan", "key-rotation", "aggregate", "nightly", "retention", "billing-sync"];
      const rows = (await sql`
        select
          coalesce(se.meta->>'job', '')::text as job,
          max(se.created_at)::text as last_run
        from public.security_events se
        where se.type = 'cron_run_ok'
          and se.created_at > now() - interval '6 hours'
          and coalesce(se.meta->>'job', '') <> ''
        group by coalesce(se.meta->>'job', '')
      `) as unknown as Array<{ job: string; last_run: string }>;
      const seen = new Set(rows.map((r) => r.job));
      cronFreshTotal = expectedJobs.length;
      cronFreshHealthy = expectedJobs.filter((j) => seen.has(j)).length;
      nightlyLastOkAt = rows.find((r) => r.job === "nightly")?.last_run ?? null;
    } catch {
      // ignore
    }
  }

  if (hasBackupRuns) {
    try {
      const rows = (await sql`
        select count(*)::int as c
        from public.backup_runs
        where coalesce(details->>'source', '') = 'github-actions'
      `) as unknown as Array<{ c: number }>;
      backupUsesGithubReporting = Number(rows?.[0]?.c ?? 0) > 0;
    } catch {
      // ignore
    }
    const backupSourceFilter = backupUsesGithubReporting
      ? sql`and coalesce(details->>'source', '') = 'github-actions'`
      : sql``;
    try {
      const rows = (await sql`
        select status::text as status, created_at::text as created_at
        from public.backup_runs
        where 1=1
          ${backupSourceFilter}
        order by created_at desc
        limit 1
      `) as unknown as Array<{ status: string; created_at: string }>;
      backupLastStatus = rows?.[0]?.status ?? null;
      backupLastCreatedAt = rows?.[0]?.created_at ?? null;
    } catch {
      // ignore
    }
    try {
      const rows = (await sql`
        select count(*)::int as c
        from public.backup_runs
        where 1=1
          ${backupSourceFilter}
      `) as unknown as Array<{ c: number }>;
      backupRunCount = Number(rows?.[0]?.c ?? 0);
    } catch {
      // ignore
    }
    try {
      const rows = (await sql`
        select
          extract(epoch from (now() - max(created_at))) / 3600.0 as hours_since
        from public.backup_runs
        where status in ('ok', 'success')
          ${backupSourceFilter}
      `) as unknown as Array<{ hours_since: number | string | null }>;
      const h = rows?.[0]?.hours_since;
      backupHoursSinceLastSuccess = h == null ? null : Number(h);
      backupFreshOk =
        backupHoursSinceLastSuccess != null &&
        Number.isFinite(backupHoursSinceLastSuccess) &&
        backupHoursSinceLastSuccess <= backupMaxAgeHours;
    } catch {
      // ignore
    }
  }

  if (hasScanJobs) {
    try {
      const rows = (await sql`
        select count(*)::int as c
        from public.malware_scan_jobs msj
        ${ownerId ? sql`join public.docs d on d.id = msj.doc_id` : sql``}
        where msj.status = 'dead_letter'
          ${ownerId ? sql`and d.owner_id = ${ownerId}::uuid` : sql``}
      `) as unknown as Array<{ c: number }>;
      deadLetterBacklog = Number(rows?.[0]?.c ?? 0);
    } catch {
      // ignore
    }
  }

  if (hasDocs && !isViewerScoped) {
    try {
      const rows = (await sql`
        select
          coalesce(sum(case when coalesce(d.encryption_enabled, false) = false then 1 else 0 end), 0)::int as unencrypted_docs,
          coalesce(sum(case when coalesce(d.encryption_enabled, false) = true and coalesce(d.enc_key_version::text, '') = '' then 1 else 0 end), 0)::int as encrypted_missing_key
        from public.docs d
      `) as unknown as Array<{ unencrypted_docs: number; encrypted_missing_key: number }>;
      unencryptedDocs = Number(rows?.[0]?.unencrypted_docs ?? 0);
      encryptedMissingKeyVersion = Number(rows?.[0]?.encrypted_missing_key ?? 0);
    } catch {
      // ignore
    }
  }

  return (
    <section className="mb-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="glass-card-strong rounded-2xl p-4">
          <div className="text-xs text-white/60">Protection status</div>
          <div className="mt-2 text-xl font-semibold text-white">
            {unencryptedDocs === 0 && presignErrors24h === 0 && scanFailures24h === 0 ? "Protected" : "Needs attention"}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            <li>{unencryptedDocs === 0 ? "All documents encrypted" : `${fmtInt(unencryptedDocs)} documents need encryption review`}</li>
            <li>{unencryptedDocs === 0 ? "0 unencrypted docs" : `${fmtInt(unencryptedDocs)} unencrypted docs`}</li>
            <li>Last security check: {fmtMinsAgo(lastSecurityEventAt)}</li>
          </ul>
        </div>

        <div className="glass-card-strong rounded-2xl p-4">
          <div className="text-xs text-white/60">Active shares</div>
          <div className="mt-1 text-3xl font-semibold text-white">{fmtInt(activeShares)}</div>
          <div className="mt-1 text-xs text-white/65">Expiring soon: {fmtInt(expiringShares)}</div>
          <Link href="/admin/upload" className="mt-3 inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15">
            Create new protected link
          </Link>
        </div>

        <div className="glass-card-strong rounded-2xl p-4">
          <div className="text-xs text-white/60">Recent activity</div>
          <div className="mt-1 text-3xl font-semibold text-white">{fmtInt(views7)}</div>
          <div className="text-xs text-white/65">Views this week</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-xs text-white/60">This month: {fmtInt(views30)}</div>
            <Sparkline values={series30} ariaLabel="Views this week sparkline" />
          </div>
          <div className="mt-2 text-xs text-white/60">
            Most viewed: {topDocs[0]?.doc_title || "No activity yet"}
          </div>
          <div className="mt-1 text-xs text-white/50">All-time views: {fmtInt(totalViews)}</div>
        </div>
      </div>

      <div className="mt-3">
        <details className="glass-card-strong rounded-2xl p-4">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">Health</div>
                <div className="mt-1 text-xs text-white/60">System checks in plain language. View details for advanced signals.</div>
              </div>
              <span className="text-xs text-white/60">View details</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                {presignErrors24h === 0 ? "Uploads working" : "Some uploads failed to start"}
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                {cronFailures24h === 0 ? "Links working" : "Some link checks failed"}
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                {unencryptedDocs === 0 ? "Encryption OK" : "Encryption needs attention"}
              </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                  {!hasBackupRuns
                    ? "Backups not configured"
                  : backupRunCount === 0
                  ? "Backups not started"
                  : backupFreshOk
                  ? "Backups healthy"
                  : "Backups need attention"}
              </div>
            </div>
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
              <div className="font-medium text-white/90">Layer 2: Guidance</div>
              <ul className="mt-2 space-y-1">
                <li>Background checks running: {fmtInt(cronFreshHealthy)}/{fmtInt(cronFreshTotal || 6)} jobs fresh in 6h</li>
                <li>Some uploads failed to start: {fmtInt(presignErrors24h)}</li>
                <li>Some background checks failed: {fmtInt(scanFailures24h)}</li>
                <li>Some items need manual processing: {fmtInt(deadLetterBacklog)}</li>
                <li>Some emails failed to send or process: {fmtInt(deadLetterAlerts24h)}</li>
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
              <div className="font-medium text-white/90">Layer 3: Advanced / System</div>
              <ul className="mt-2 space-y-1">
                <li>Revoked shares: {fmtInt(revokedShares)}</li>
                <li>Alias links expiring (3d): {fmtInt(expiringAliases)}</li>
                <li>Backup source: {backupUsesGithubReporting ? "GitHub Actions webhook" : "Nightly webhook check"}</li>
                <li>Backup status: {backupLastStatus || "not configured"}</li>
                <li>Backup freshness: {backupHoursSinceLastSuccess == null ? "unknown" : `${backupHoursSinceLastSuccess.toFixed(1)}h`}</li>
                <li>Security signals (24h): {fmtInt(topSecurityTypes.reduce((a, b) => a + b.c, 0))}</li>
                <li>Encrypted docs missing key version: {fmtInt(encryptedMissingKeyVersion)}</li>
                <li>Abuse spikes (24h): {fmtInt(abuseSpikes24h)}</li>
              </ul>
              {!isViewerScoped ? (
                <Link href="/admin/security" className="mt-3 inline-flex rounded-md border border-white/20 px-2 py-1 text-xs text-white/85 hover:bg-white/10">
                  Open security details
                </Link>
              ) : null}
            </div>
          </div>
          {!isViewerScoped ? (
            <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] p-3 text-xs text-white/80">
              <div className="font-medium text-white">Owner: Backup setup check</div>
              <div className="mt-1 text-white/65">Use this to diagnose why backup health is not green.</div>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Automation: {backupAutomationEnabled ? "Enabled" : "Disabled"}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Backup destination: {backupUsesGithubReporting || backupStatusWebhookTokenConfigured
                    ? (backupStatusWebhookTokenConfigured ? "GitHub status webhook configured" : "GitHub status webhook missing app token")
                    : (backupWebhookConfigured ? "Configured" : "Missing BACKUP_WEBHOOK_URL")}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Backup telemetry table: {hasBackupRuns ? "Ready" : "Missing public.backup_runs"}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Recorded runs: {hasBackupRuns ? fmtInt(backupRunCount) : "0"}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Last backup run: {backupLastCreatedAt ? `${backupLastStatus || "unknown"} (${fmtMinsAgo(backupLastCreatedAt)})` : "No run yet"}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Last successful backup: {backupHoursSinceLastSuccess == null ? "No success yet" : `${backupHoursSinceLastSuccess.toFixed(1)}h ago`}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Freshness threshold: {backupMaxAgeHours}h
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Nightly cron: {nightlyLastOkAt ? `OK (${fmtMinsAgo(nightlyLastOkAt)})` : "No recent nightly cron ok event"}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white/75">
                Next step: {backupUsesGithubReporting || backupStatusWebhookTokenConfigured
                  ? "set `BACKUP_STATUS_WEBHOOK_TOKEN` in app env, set GitHub `BACKUP_STATUS_WEBHOOK_URL`, run backup workflow once, then confirm at least one `ok` row in `public.backup_runs` from `github-actions`."
                  : "set `BACKUP_AUTOMATION_ENABLED=true`, set `BACKUP_WEBHOOK_URL`, verify cron secret wiring, then run `/api/cron/nightly` once and confirm at least one `ok` row in `public.backup_runs`."}
              </div>
            </div>
          ) : null}
        </details>
      </div>
    </section>
  );
}
