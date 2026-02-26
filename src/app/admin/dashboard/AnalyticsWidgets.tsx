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

export default async function AnalyticsWidgets({ ownerId }: { ownerId?: string; }) {
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
  let backupHoursSinceLastSuccess: number | null = null;
  let backupFreshOk = false;
  let topSecurityTypes: Array<{ type: string; c: number }> = [];

  if (hasSecurityEvents) {
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
      const expectedJobs = ["webhooks", "scan", "key-rotation", "aggregate", "nightly", "retention"];
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
    } catch {
      // ignore
    }
  }

  if (hasBackupRuns) {
    try {
      const rows = (await sql`
        select status::text as status
        from public.backup_runs
        order by created_at desc
        limit 1
      `) as unknown as Array<{ status: string }>;
      backupLastStatus = rows?.[0]?.status ?? null;
    } catch {
      // ignore
    }
    try {
      const rows = (await sql`
        select
          extract(epoch from (now() - max(created_at))) / 3600.0 as hours_since
        from public.backup_runs
        where status in ('ok', 'success')
      `) as unknown as Array<{ hours_since: number | string | null }>;
      const h = rows?.[0]?.hours_since;
      backupHoursSinceLastSuccess = h == null ? null : Number(h);
      backupFreshOk =
        backupHoursSinceLastSuccess != null &&
        Number.isFinite(backupHoursSinceLastSuccess) &&
        backupHoursSinceLastSuccess <= Number(process.env.BACKUP_MAX_AGE_HOURS || 30);
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

  return (
    <section className="mb-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
          <div className="text-xs text-neutral-400">Total views (all time)</div>
          <div className="mt-1 text-2xl font-semibold text-neutral-100">{fmtInt(totalViews)}</div>
          <div className="mt-2 text-xs text-neutral-400">Last 30 days</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-neutral-200">{fmtInt(views30)}</div>
            <div className="text-neutral-400">
              <Sparkline values={series30} ariaLabel="30 day views sparkline" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
          <div className="text-xs text-neutral-400">Rolling views</div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-semibold text-neutral-100">{fmtInt(views7)}</div>
              <div className="text-xs text-neutral-400">Last 7 days</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-neutral-100">{fmtInt(views30)}</div>
              <div className="text-xs text-neutral-400">Last 30 days</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-400">
            {hasDocViewDaily ? (
              <span>Using daily aggregates (fast).</span>
            ) : (
              <span>Using raw logs (enable doc_view_daily for faster widgets).</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
          <div className="text-xs text-neutral-400">Shares</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(activeShares)}</div>
              <div className="text-xs text-neutral-400">Active</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(revokedShares)}</div>
              <div className="text-xs text-neutral-400">Revoked</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(expiringShares)}</div>
              <div className="text-xs text-neutral-400">Expiring (3d)</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-400">Alias expiring (3d): {fmtInt(expiringAliases)}</div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
          <div className="text-xs text-neutral-400">Top docs (30d)</div>
          <ol className="mt-2 space-y-1 text-sm">
            {topDocs.length ? (
              topDocs.map((d) => (
                <li key={d.doc_id} className="flex items-center justify-between gap-2">
                  <Link className="truncate text-neutral-200 underline-offset-2 hover:underline" href={`/admin/docs/${d.doc_id}`}>
                    {d.doc_title || d.doc_id.slice(0, 8)}
                  </Link>
                  <span className="shrink-0 text-xs text-neutral-400">{fmtInt(d.views_30)}</span>
                </li>
              ))
            ) : (
              <li className="text-xs text-neutral-400">No data yet.</li>
            )}
          </ol>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-neutral-400">Security ops (24h)</div>
            <Link className="text-[11px] text-neutral-400 underline-offset-2 hover:underline" href="/admin/security">
              Open security
            </Link>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(scanFailures24h)}</div>
              <div className="text-xs text-neutral-400">Scan failures</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(deadLetterAlerts24h)}</div>
              <div className="text-xs text-neutral-400">Dead-letter alerts</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(presignErrors24h)}</div>
              <div className="text-xs text-neutral-400">Presign errors</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(abuseSpikes24h)}</div>
              <div className="text-xs text-neutral-400">Abuse spikes</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-400">Dead-letter backlog: {fmtInt(deadLetterBacklog)}</div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
          <div className="text-xs text-neutral-400">Ops readiness (24h)</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(cronRuns24h)}</div>
              <div className="text-xs text-neutral-400">Cron runs</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">{fmtInt(cronFailures24h)}</div>
              <div className="text-xs text-neutral-400">Cron failures</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">
                {cronFreshHealthy}/{cronFreshTotal || 6}
              </div>
              <div className="text-xs text-neutral-400">Fresh cron jobs (6h)</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-neutral-100">
                {backupLastStatus || "n/a"}
              </div>
              <div className="text-xs text-neutral-400">Last backup status</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-400">
            Backup freshness:{" "}
            <span className={backupFreshOk ? "text-emerald-300" : "text-amber-300"}>
              {backupHoursSinceLastSuccess == null ? "unknown" : `${backupHoursSinceLastSuccess.toFixed(1)}h`}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
          <div className="text-xs text-neutral-400">Top security events (24h)</div>
          <ol className="mt-2 space-y-1 text-sm">
            {topSecurityTypes.length ? (
              topSecurityTypes.map((r) => (
                <li key={r.type} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-neutral-200">{r.type}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{fmtInt(r.c)}</span>
                </li>
              ))
            ) : (
              <li className="text-xs text-neutral-400">No security events in the last 24 hours.</li>
            )}
          </ol>
        </div>
      </div>
    </section>
  );
}
