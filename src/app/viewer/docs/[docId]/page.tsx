import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import Sparkline from "@/components/Sparkline";
import {
  createOrAssignAliasAction,
  disableAliasForDocAction,
  renameDocAliasAction,
  setAliasExpirationAction,
} from "@/app/admin/actions";

export const runtime = "nodejs";

async function tableExists(fqTable: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${fqTable})::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${table}
        and column_name = ${column}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
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

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

const card = "surface-panel rounded-sm p-5";
const subtle = "text-xs font-medium tracking-[0.16em] uppercase text-[var(--text-faint)]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

export default async function ViewerDocDetailPage({
  params,
}: {
  params: Promise<{ docId: string }> | { docId: string };
}) {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/signin");
  }

  const resolvedParams = await Promise.resolve(params);
  const docId = String(resolvedParams?.docId || "").trim();
  if (!docId || !isUuid(docId)) notFound();

  if (u.role === "admin" || u.role === "owner") {
    redirect(`/admin/docs/${encodeURIComponent(docId)}`);
  }

  const canSeeAll = false;
  const isViewer = !canSeeAll;
  const hasDocs = await tableExists("public.docs");
  if (!hasDocs) notFound();

  const hasOwnerId = await columnExists("docs", "owner_id");
  const hasOrgId = await columnExists("docs", "org_id");
  const hasCreatedByEmail = await columnExists("docs", "created_by_email");
  const orgGate = hasOrgId && u.orgId ? sql`and d.org_id = ${u.orgId}::uuid` : sql``;
  const ownerGate = !canSeeAll
    ? hasOwnerId
      ? hasCreatedByEmail
        ? sql`and (d.owner_id = ${u.id}::uuid or (d.owner_id is null and lower(coalesce(d.created_by_email,'')) = lower(${u.email})))`
        : sql`and d.owner_id = ${u.id}::uuid`
      : hasCreatedByEmail
        ? sql`and lower(coalesce(d.created_by_email,'')) = lower(${u.email})`
        : sql``
    : sql``;
  const scopeGate = sql`${orgGate} ${ownerGate}`;

  const docRows = (await sql`
    select
      d.id::text as id,
      d.title::text as title,
      d.created_at::text as created_at
    from public.docs d
    where d.id = ${docId}::uuid
      ${scopeGate}
    limit 1
  `) as unknown as Array<{ id: string; title: string | null; created_at: string | null }>;

  const doc = docRows?.[0];
  if (!doc) notFound();

  const hasDocAliases = await tableExists("public.doc_aliases");
  let alias: string | null = null;
  let aliasExpires: string | null = null;
  let aliasActive: boolean | null = null;
  let aliasRevokedAt: string | null = null;

  if (hasDocAliases) {
    try {
      const rows = (await sql`
        select alias::text as alias, expires_at::text as expires_at, is_active, revoked_at::text as revoked_at
        from public.doc_aliases
        where doc_id = ${docId}::uuid
        order by created_at desc nulls last
        limit 1
      `) as unknown as Array<{ alias: string | null; expires_at: string | null; is_active: boolean | null; revoked_at: string | null }>;
      alias = rows?.[0]?.alias ?? null;
      aliasExpires = rows?.[0]?.expires_at ?? null;
      aliasActive = rows?.[0]?.is_active ?? null;
      aliasRevokedAt = rows?.[0]?.revoked_at ?? null;
    } catch {
      // ignore
    }
  }

  const hasDocViewDaily = await tableExists("public.doc_view_daily");
  const hasDocViews = await tableExists("public.doc_views");

  let series30: Array<{ day: string; views: number; unique_ips: number }> = [];
  let views30 = 0;
  let views7 = 0;

  if (hasDocViewDaily) {
    try {
      series30 = (await sql`
        with days as (
          select generate_series(current_date - interval '29 days', current_date, interval '1 day')::date as day
        )
        select
          days.day::text as day,
          coalesce(dvd.view_count, 0)::int as views,
          coalesce(dvd.unique_ip_count, 0)::int as unique_ips
        from days
        left join public.doc_view_daily dvd
          on dvd.date = days.day
         and dvd.doc_id = ${docId}::uuid
        order by 1 asc
      `) as unknown as Array<{ day: string; views: number; unique_ips: number }>;
    } catch {
      series30 = [];
    }
  } else if (hasDocViews) {
    try {
      series30 = (await sql`
        with days as (
          select generate_series(current_date - interval '29 days', current_date, interval '1 day')::date as day
        ),
        agg as (
          select
            date_trunc('day', v.created_at)::date as day,
            count(*)::int as views,
            count(distinct coalesce(v.ip_hash, ''))::int as unique_ips
          from public.doc_views v
          where v.doc_id = ${docId}::uuid
            and v.created_at >= (now() - interval '30 days')
          group by 1
        )
        select
          days.day::text as day,
          coalesce(agg.views, 0)::int as views,
          coalesce(agg.unique_ips, 0)::int as unique_ips
        from days
        left join agg on agg.day = days.day
        order by 1 asc
      `) as unknown as Array<{ day: string; views: number; unique_ips: number }>;
    } catch {
      series30 = [];
    }
  }

  const sparkVals = series30.map((r) => r.views);
  views30 = sparkVals.reduce((a, b) => a + b, 0);
  views7 = sparkVals.slice(-7).reduce((a, b) => a + b, 0);

  const hasShareTokens = !isViewer && (await tableExists("public.share_tokens"));
  type ShareRow = {
    token: string;
    created_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    views_count: number | null;
    max_views: number | null;
  };
  let shares: ShareRow[] = [];
  let activeShares = 0;

  if (hasShareTokens) {
    try {
      shares = (await sql`
        select
          st.token::text as token,
          st.created_at::text as created_at,
          st.expires_at::text as expires_at,
          st.revoked_at::text as revoked_at,
          st.views_count::int as views_count,
          st.max_views::int as max_views
        from public.share_tokens st
        where st.doc_id = ${docId}::uuid
        order by st.created_at desc nulls last
        limit 50
      `) as unknown as ShareRow[];

      activeShares = shares.filter((s) => {
        if (s.revoked_at) return false;
        if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) return false;
        if (s.max_views && s.max_views > 0 && (s.views_count || 0) >= s.max_views) return false;
        return true;
      }).length;
    } catch {
      shares = [];
    }
  }

  type IpRow = { ip_hash: string; views: number };
  let ipRows: IpRow[] = [];
  if (!isViewer && hasDocViews) {
    try {
      ipRows = (await sql`
        select
          coalesce(v.ip_hash, '')::text as ip_hash,
          count(*)::int as views
        from public.doc_views v
        where v.doc_id = ${docId}::uuid
          and v.created_at >= (now() - interval '30 days')
        group by 1
        order by views desc
        limit 10
      `) as unknown as IpRow[];
    } catch {
      ipRows = [];
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={subtle}>Document</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{doc.title || doc.id}</h1>
          <div className="mt-1 text-xs text-[var(--text-muted)]">Created: {fmtDate(doc.created_at)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="btn-base btn-secondary inline-flex rounded-sm px-3 py-2 text-sm"
            href="/viewer/documents"
          >
            ← Back
          </Link>
          {alias ? (
            <Link
              className="btn-base btn-secondary inline-flex rounded-sm px-3 py-2 text-sm"
              href={`/d/${encodeURIComponent(alias)}`}
            >
              Open
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className={card}>
          <div className={subtle}>Views</div>
          <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{fmtInt(views30)}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">Last 30 days</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--text-secondary)]">
              {fmtInt(views7)} <span className="text-xs text-[var(--text-faint)]">/ 7d</span>
            </div>
            <div className="text-[var(--text-faint)]">
              <Sparkline values={sparkVals} ariaLabel="30 day views sparkline" />
            </div>
          </div>
        </div>

        <div className={card}>
          <div className={subtle}>Alias</div>
          <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">{alias || "—"}</div>
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            Expires: {fmtDate(aliasExpires)} • Active: {String(aliasActive ?? true)} • Revoked: {fmtDate(aliasRevokedAt)}
          </div>
          {!isViewer ? (
            <div className="mt-3 space-y-2">
              <form action={createOrAssignAliasAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="docId" value={docId} />
                <label className="text-xs text-[var(--text-secondary)]">
                  Create alias
                  <input
                    aria-label="Create alias"
                    name="alias"
                    placeholder="new-alias"
                    className="field-input mt-1 w-40 rounded-sm px-2.5 py-2 text-xs"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)]">
                  TTL days
                  <input
                    aria-label="Alias TTL days"
                    type="number"
                    name="expiresDays"
                    min={1}
                    max={365}
                    defaultValue={30}
                    className="field-input mt-1 w-20 rounded-sm px-2.5 py-2 text-xs"
                  />
                </label>
                <button type="submit" className="btn-base btn-primary rounded-sm px-3 py-2 text-xs font-semibold">
                  Create
                </button>
              </form>

              {alias ? (
                <form action={renameDocAliasAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="docId" value={docId} />
                  <label className="text-xs text-[var(--text-secondary)]">
                    Rename alias
                    <input
                      aria-label="Rename alias"
                      name="newAlias"
                      defaultValue={alias}
                      className="field-input mt-1 w-44 rounded-sm px-2.5 py-2 text-xs"
                    />
                  </label>
                  <button type="submit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-xs">
                    Rename
                  </button>
                </form>
              ) : null}

              <form action={setAliasExpirationAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="docId" value={docId} />
                <label className="text-xs text-[var(--text-secondary)]">
                  Set expiration (days)
                  <input
                    aria-label="Set alias expiration days"
                    type="number"
                    name="days"
                    min={1}
                    max={365}
                    defaultValue={30}
                    className="field-input mt-1 w-20 rounded-sm px-2.5 py-2 text-xs"
                  />
                </label>
                <button type="submit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-xs">
                  Apply
                </button>
              </form>

              {canSeeAll ? (
                <form action={disableAliasForDocAction}>
                  <input type="hidden" name="docId" value={docId} />
                  <button
                    type="submit"
                    className="inline-flex rounded-sm border border-[color:rgba(186,71,50,0.2)] bg-[color:rgba(186,71,50,0.08)] px-3 py-2 text-xs font-medium text-[var(--danger)] transition hover:bg-[color:rgba(186,71,50,0.12)]"
                  >
                    Disable alias
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={card}>
          <div className={subtle}>Shares</div>
          <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{fmtInt(activeShares)}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">Active (top 50 listed)</div>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">30-day view history</h2>
          <div className={subtle}>{hasDocViewDaily ? "Using doc_view_daily" : hasDocViews ? "Using doc_views" : "No view tables found"}</div>
        </div>

        <div className="mt-3 overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white/92">
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-[680px] w-full text-sm">
              <thead className="sticky top-0 bg-[rgba(245,248,252,0.96)] text-left text-xs text-[var(--text-muted)] backdrop-blur">
                <tr>
                  <th className="py-2 pr-4">Day</th>
                  <th className="py-2 pr-4">Views</th>
                  <th className="py-2 pr-4">Unique IPs</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-primary)]">
                {series30.length ? (
                  series30
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.day} className="border-t border-[var(--border-subtle)]">
                        <td className="py-2 pr-4">{r.day}</td>
                        <td className="py-2 pr-4">{fmtInt(r.views)}</td>
                        <td className="py-2 pr-4">{fmtInt(r.unique_ips)}</td>
                      </tr>
                    ))
                ) : (
                  <tr className="border-t border-[var(--border-subtle)]">
                    <td className="py-3 text-xs text-[var(--text-muted)]" colSpan={3}>
                      No data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {!isViewer ? (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div className={card}>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Share history</h2>
            <div className="mt-3 overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white/92">
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="sticky top-0 bg-[rgba(245,248,252,0.96)] text-left text-xs text-[var(--text-muted)] backdrop-blur">
                    <tr>
                      <th className="py-2 pr-4">Token</th>
                      <th className="py-2 pr-4">Created</th>
                      <th className="py-2 pr-4">Expires</th>
                      <th className="py-2 pr-4">Views</th>
                      <th className="py-2 pr-4">Max</th>
                      <th className="py-2 pr-4">Revoked</th>
                    </tr>
                  </thead>
                  <tbody className="text-[var(--text-primary)]">
                    {shares.length ? (
                      shares.map((s) => (
                        <tr key={s.token} className="border-t border-[var(--border-subtle)]">
                          <td className="py-2 pr-4 font-mono text-xs text-[var(--text-secondary)]">{s.token.slice(0, 10)}…</td>
                          <td className="py-2 pr-4">{fmtDate(s.created_at)}</td>
                          <td className="py-2 pr-4">{fmtDate(s.expires_at)}</td>
                          <td className="py-2 pr-4">{fmtInt(s.views_count ?? 0)}</td>
                          <td className="py-2 pr-4">{s.max_views ?? "—"}</td>
                          <td className="py-2 pr-4">{fmtDate(s.revoked_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-[var(--border-subtle)]">
                        <td className="py-3 text-xs text-[var(--text-muted)]" colSpan={6}>
                          No shares found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">IP breakdown (30d)</h2>
            <div className="mt-1 text-xs text-[var(--text-muted)]">Hashed IPs (privacy-preserving).</div>
            <div className="mt-3 overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-white/92">
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-[520px] w-full text-sm">
                  <thead className="sticky top-0 bg-[rgba(245,248,252,0.96)] text-left text-xs text-[var(--text-muted)] backdrop-blur">
                    <tr>
                      <th className="py-2 pr-4">IP hash</th>
                      <th className="py-2 pr-4">Views</th>
                    </tr>
                  </thead>
                  <tbody className="text-[var(--text-primary)]">
                    {ipRows.length ? (
                      ipRows.map((r) => (
                        <tr key={r.ip_hash} className="border-t border-[var(--border-subtle)]">
                          <td className="py-2 pr-4 font-mono text-xs text-[var(--text-secondary)]">{(r.ip_hash || "—").slice(0, 18)}…</td>
                          <td className="py-2 pr-4">{fmtInt(r.views)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-[var(--border-subtle)]">
                        <td className="py-3 text-xs text-[var(--text-muted)]" colSpan={2}>
                          No data yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="text-xs text-[var(--text-muted)]">
        Note: download counts are not tracked separately yet; current page shows view/access activity only.
      </div>
    </div>
  );
}
