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

  return (
    <section className="mb-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Total views (all time)</div>
          <div className="mt-1 text-2xl font-semibold">{fmtInt(totalViews)}</div>
          <div className="mt-2 text-xs text-neutral-500">Last 30 days</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{fmtInt(views30)}</div>
            <Sparkline values={series30} ariaLabel="30 day views sparkline" />
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Rolling views</div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-semibold">{fmtInt(views7)}</div>
              <div className="text-xs text-neutral-500">Last 7 days</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{fmtInt(views30)}</div>
              <div className="text-xs text-neutral-500">Last 30 days</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-500">
            {hasDocViewDaily ? (
              <span>Using daily aggregates (fast).</span>
            ) : (
              <span>Using raw logs (enable doc_view_daily for faster widgets).</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Shares</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <div className="text-xl font-semibold">{fmtInt(activeShares)}</div>
              <div className="text-xs text-neutral-500">Active</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{fmtInt(revokedShares)}</div>
              <div className="text-xs text-neutral-500">Revoked</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{fmtInt(expiringShares)}</div>
              <div className="text-xs text-neutral-500">Expiring (3d)</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-500">Alias expiring (3d): {fmtInt(expiringAliases)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Top docs (30d)</div>
          <ol className="mt-2 space-y-1 text-sm">
            {topDocs.length ? (
              topDocs.map((d) => (
                <li key={d.doc_id} className="flex items-center justify-between gap-2">
                  <Link className="truncate underline-offset-2 hover:underline" href={`/admin/docs/${d.doc_id}`}>
                    {d.doc_title || d.doc_id.slice(0, 8)}
                  </Link>
                  <span className="shrink-0 text-xs text-neutral-500">{fmtInt(d.views_30)}</span>
                </li>
              ))
            ) : (
              <li className="text-xs text-neutral-500">No data yet.</li>
            )}
          </ol>
        </div>
      </div>
    </section>
  );
}
