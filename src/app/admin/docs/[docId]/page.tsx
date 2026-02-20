// src/app/admin/docs/[docId]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { isOwnerAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

async function tableExists(fqTable: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${fqTable})::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

function Bars({ values }: { values: Array<{ label: string; v: number }> }) {
  const w = 720;
  const h = 140;
  const padX = 10;
  const padY = 12;
  const max = Math.max(1, ...values.map((x) => x.v));
  const n = values.length;
  const barW = n > 0 ? (w - padX * 2) / n : 0;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block w-full">
      {/* axis */}
      <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="currentColor" opacity={0.25} />
      {values.map((x, i) => {
        const bh = Math.round(((h - padY * 2) * x.v) / max);
        const x0 = padX + i * barW;
        const y0 = h - padY - bh;
        return (
          <g key={x.label}>
            <rect x={x0 + 1} y={y0} width={Math.max(1, barW - 2)} height={bh} fill="currentColor" opacity={0.5} />
          </g>
        );
      })}
    </svg>
  );
}

type DocMeta = {
  id: string;
  title: string | null;
  created_at: string;
  alias: string | null;
  r2_key: string | null;
  bucket: string | null;
};

type SeriesRow = { day: string; views: number; uniques: number };
type TopRow = { k: string; c: number };
type ShareRow = {
  token: string;
  to_email: string | null;
  created_at: string;
  expires_at: string | null;
  max_views: number | null;
  views_count: number | null;
  revoked_at: string | null;
  has_password: boolean;
};

export default async function AdminDocInvestigatePage(props: { params: Promise<{ docId: string }> }) {
  const ok = await isOwnerAdmin();
  if (!ok) redirect("/api/auth/signin");

  const { docId } = await props.params;
  const id = (docId || "").trim();
  if (!id) redirect("/admin/dashboard#views-by-doc");

  const docRows = (await sql`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      a.alias,
      d.r2_key::text as r2_key,
      coalesce(d.r2_bucket::text, null) as bucket
    from public.docs d
    left join public.doc_aliases a on a.doc_id = d.id
    where d.id = ${id}::uuid
    limit 1
  `) as unknown as DocMeta[];

  const doc = docRows[0];
  if (!doc?.id) redirect("/admin/dashboard#views-by-doc");

  const hasDocViewDaily = await tableExists("public.doc_view_daily");
  const hasDocViews = await tableExists("public.doc_views");
  const hasShareTokenInDocViews = await (async () => {
    try {
      const rows = (await sql`
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'doc_views'
          and column_name = 'share_token'
        limit 1
      `) as unknown as Array<{ "?column?": number }>;
      return rows.length > 0;
    } catch {
      return false;
    }
  })();

  // 30-day series (views + uniques)
  let series: SeriesRow[] = [];
  try {
    if (hasDocViewDaily) {
      series = (await sql`
        select
          x.date::text as day,
          x.view_count::int as views,
          x.unique_ip_count::int as uniques
        from public.doc_view_daily x
        where x.doc_id = ${doc.id}::uuid
          and x.date >= (current_date - interval '29 days')
        order by x.date asc
      `) as unknown as SeriesRow[];
    } else if (hasDocViews) {
      series = (await sql`
        select
          date_trunc('day', v.created_at)::date::text as day,
          count(*)::int as views,
          count(distinct coalesce(v.ip_hash, ''))::int as uniques
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '30 days')
        group by 1
        order by 1 asc
      `) as unknown as SeriesRow[];
    }
  } catch {
    series = [];
  }

  // Spike detection: last 24h vs baseline (previous 7 days avg/day)
  let spike: { last24: number; baseline: number; ratio: number | null } = { last24: 0, baseline: 0, ratio: null };
  try {
    if (hasDocViews) {
      const last24Rows = (await sql`
        select count(*)::int as c
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '24 hours')
      `) as unknown as Array<{ c: number }>;
      const last24 = last24Rows?.[0]?.c ?? 0;

      const baselineRows = (await sql`
        select count(*)::int as c
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '8 days')
          and v.created_at < (now() - interval '24 hours')
      `) as unknown as Array<{ c: number }>;
      const baselineTotal = baselineRows?.[0]?.c ?? 0;
      const baseline = Math.round(baselineTotal / 7);

      const ratio = baseline > 0 ? last24 / baseline : null;
      spike = { last24, baseline, ratio };
    }
  } catch {
    spike = { last24: 0, baseline: 0, ratio: null };
  }

  // Unique devices (last 30 days)
  let uniqueDevices: number | null = null;
  let topIps: Array<{ ip_hash: string; views: number; last: string | null }> = [];
  try {
    if (hasDocViews) {
      const u = (await sql`
        select count(distinct coalesce(v.ip_hash, ''))::int as c
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '30 days')
      `) as unknown as Array<{ c: number }>;
      uniqueDevices = u?.[0]?.c ?? 0;

      topIps = (await sql`
        select
          coalesce(v.ip_hash, '')::text as ip_hash,
          count(*)::int as views,
          max(v.created_at)::text as last
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '30 days')
        group by 1
        order by views desc
        limit 12
      `) as unknown as Array<{ ip_hash: string; views: number; last: string | null }>;
    }
  } catch {
    uniqueDevices = null;
    topIps = [];
  }

  // Top referers + user agents (last 30 days)
  let topReferers: TopRow[] = [];
  let topUserAgents: TopRow[] = [];
  try {
    if (hasDocViews) {
      topReferers = (await sql`
        select
          coalesce(nullif(v.referer, ''), '(none)')::text as k,
          count(*)::int as c
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '30 days')
        group by 1
        order by c desc
        limit 10
      `) as unknown as TopRow[];

      topUserAgents = (await sql`
        select
          coalesce(nullif(v.user_agent, ''), '(none)')::text as k,
          count(*)::int as c
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '30 days')
        group by 1
        order by c desc
        limit 10
      `) as unknown as TopRow[];
    }
  } catch {
    topReferers = [];
    topUserAgents = [];
  }

  // Shares for this doc
  let shares: ShareRow[] = [];
  try {
    shares = (await sql`
      select
        s.token::text as token,
        s.to_email,
        s.created_at::text as created_at,
        s.expires_at::text as expires_at,
        s.max_views,
        s.views_count,
        s.revoked_at::text as revoked_at,
        (s.password_hash is not null) as has_password
      from public.share_tokens s
      where s.doc_id = ${doc.id}::uuid
      order by s.created_at desc
      limit 250
    `) as unknown as ShareRow[];
  } catch {
    shares = [];
  }

  // Per-share breakdown (requires doc_views.share_token)
  let byShare: Array<{ token: string; views: number; uniques: number; last: string | null }> = [];
  try {
    if (hasDocViews && hasShareTokenInDocViews) {
      byShare = (await sql`
        select
          v.share_token::text as token,
          count(*)::int as views,
          count(distinct coalesce(v.ip_hash, ''))::int as uniques,
          max(v.created_at)::text as last
        from public.doc_views v
        where v.doc_id = ${doc.id}::uuid
          and v.created_at >= (now() - interval '30 days')
          and v.share_token is not null
        group by 1
        order by views desc
        limit 50
      `) as unknown as Array<{ token: string; views: number; uniques: number; last: string | null }>;
    }
  } catch {
    byShare = [];
  }

  const chartValues = series.map((r) => ({ label: r.day, v: r.views }));

  const isSpike = spike.ratio != null && spike.ratio >= 6 && spike.last24 >= 10;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investigate</h1>
          <div className="mt-2 text-sm text-neutral-300">{doc.title || "Untitled"}</div>
          <div className="mt-1 text-xs text-neutral-500 font-mono">{doc.id}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <Link href="/admin/dashboard#views-by-doc" className="text-blue-400 hover:underline">
              ← Back to dashboard
            </Link>
            {doc.alias ? (
              <>
                <span className="text-neutral-700">·</span>
                <Link href={`/d/${doc.alias}`} target="_blank" className="text-blue-400 hover:underline">
                  Open alias
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {isSpike ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <div className="font-semibold">Spike detected</div>
            <div className="mt-1 text-xs text-amber-200/80">
              Last 24h: {spike.last24} · Baseline/day (prev 7d): {spike.baseline} · Ratio: {spike.ratio?.toFixed(1)}×
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300">
            <div className="font-semibold">24h vs baseline</div>
            <div className="mt-1 text-xs text-neutral-400">
              Last 24h: {spike.last24} · Baseline/day (prev 7d): {spike.baseline}
              {spike.ratio != null ? <> · Ratio: {spike.ratio.toFixed(1)}×</> : null}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-200">Views (last 30 days)</h2>
            <div className="text-xs text-neutral-500">{hasDocViewDaily ? "doc_view_daily" : "doc_views"}</div>
          </div>
          <div className="mt-3 text-neutral-200">
            {chartValues.length ? <Bars values={chartValues} /> : <div className="text-sm text-neutral-500">No data</div>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-500 md:grid-cols-4">
            <div>
              <div className="text-neutral-300">Total</div>
              <div>{series.reduce((acc, r) => acc + (r.views || 0), 0)}</div>
            </div>
            <div>
              <div className="text-neutral-300">Unique devices</div>
              <div>{uniqueDevices ?? "—"}</div>
            </div>
            <div>
              <div className="text-neutral-300">Created</div>
              <div>{fmtDate(doc.created_at)}</div>
            </div>
            <div>
              <div className="text-neutral-300">Alias</div>
              <div>{doc.alias ? `/d/${doc.alias}` : "—"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-sm font-semibold text-neutral-200">Top devices (last 30d)</h2>
          <div className="mt-3 space-y-2">
            {topIps.length === 0 ? (
              <div className="text-sm text-neutral-500">No data</div>
            ) : (
              topIps.map((r) => (
                <div key={r.ip_hash} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-neutral-300">{r.ip_hash || "(none)"}</div>
                    <div className="text-[11px] text-neutral-500">Last: {fmtDate(r.last)}</div>
                  </div>
                  <div className="text-xs text-neutral-200">{r.views}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-sm font-semibold text-neutral-200">Top referers (last 30d)</h2>
          <div className="mt-3 space-y-2">
            {topReferers.length === 0 ? (
              <div className="text-sm text-neutral-500">No data</div>
            ) : (
              topReferers.map((r) => (
                <div key={r.k} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 truncate text-xs text-neutral-300">{r.k}</div>
                  <div className="text-xs text-neutral-200">{r.c}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-sm font-semibold text-neutral-200">Top user agents (last 30d)</h2>
          <div className="mt-3 space-y-2">
            {topUserAgents.length === 0 ? (
              <div className="text-sm text-neutral-500">No data</div>
            ) : (
              topUserAgents.map((r) => (
                <div key={r.k} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 truncate text-xs text-neutral-300">{r.k}</div>
                  <div className="text-xs text-neutral-200">{r.c}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Shares for this doc</h2>
            <p className="mt-1 text-sm text-neutral-400">Investigate whether specific share links are driving views.</p>
          </div>
          <div className="text-xs text-neutral-500">{shares.length} shares</div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                <tr>
                  <th className="px-4 py-3 text-left">Token</th>
                  <th className="px-4 py-3 text-left">Recipient</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-right">Max</th>
                  <th className="px-4 py-3 text-right">Views (counter)</th>
                  <th className="px-4 py-3 text-right">Revoked</th>
                </tr>
              </thead>
              <tbody>
                {shares.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-neutral-400">
                      No shares found for this doc.
                    </td>
                  </tr>
                ) : (
                  shares.map((s) => (
                    <tr key={s.token} className="border-t border-neutral-800">
                      <td className="px-4 py-3">
                        <Link href={`/s/${s.token}`} target="_blank" className="font-mono text-xs text-blue-400 hover:underline">
                          {s.token}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-neutral-200">{s.to_email || <span className="text-neutral-500">(public)</span>}</td>
                      <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{fmtDate(s.created_at)}</td>
                      <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{fmtDate(s.expires_at)}</td>
                      <td className="px-4 py-3 text-right text-neutral-200">{s.max_views == null ? "—" : s.max_views === 0 ? "∞" : s.max_views}</td>
                      <td className="px-4 py-3 text-right text-neutral-200">{Number(s.views_count ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-neutral-400 whitespace-nowrap">{s.revoked_at ? fmtDate(s.revoked_at) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">Per-share view breakdown (last 30d)</h3>
            <div className="text-xs text-neutral-500">{hasShareTokenInDocViews ? "enabled" : "requires doc_views.share_token"}</div>
          </div>
          {!hasShareTokenInDocViews ? (
            <div className="mt-2 text-sm text-neutral-400">
              To unlock this: run the SQL in <span className="font-mono">scripts/sql/doc_views_attribution.sql</span>.
            </div>
          ) : byShare.length === 0 ? (
            <div className="mt-2 text-sm text-neutral-500">No attributed share views found.</div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-800">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                    <tr>
                      <th className="px-4 py-3 text-left">Token</th>
                      <th className="px-4 py-3 text-right">Views</th>
                      <th className="px-4 py-3 text-right">Unique devices</th>
                      <th className="px-4 py-3 text-right">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byShare.map((r) => (
                      <tr key={r.token} className="border-t border-neutral-800">
                        <td className="px-4 py-3">
                          <Link href={`/s/${r.token}`} target="_blank" className="font-mono text-xs text-blue-400 hover:underline">
                            {r.token}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-200">{r.views}</td>
                        <td className="px-4 py-3 text-right text-neutral-200">{r.uniques}</td>
                        <td className="px-4 py-3 text-right text-neutral-400 whitespace-nowrap">{fmtDate(r.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
