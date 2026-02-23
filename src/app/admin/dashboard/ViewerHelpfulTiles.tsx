// src/app/admin/dashboard/ViewerHelpfulTiles.tsx
import Link from "next/link";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  userId: string;
  orgId?: string | null;
  hasOrgId: boolean;
};

type MostViewed = { doc_id: string; title: string | null; views: number };

type RecentShare = {
  token: string;
  doc_id: string;
  title: string | null;
  created_at: string | null;
  expires_at: string | null;
};

type ExpiringItem = {
  kind: "share" | "alias";
  token_or_alias: string;
  doc_id: string;
  doc_title: string | null;
  expires_at: string | null;
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function chip(label: string) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/80">{label}</span>
  );
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${table}
        and column_name = ${column}
      limit 1
    `) as unknown as Array<{ "?column?": number }>; // shape doesn't matter
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function hasTable(table: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${table}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export default async function ViewerHelpfulTiles({ userId, orgId, hasOrgId }: Props) {
  // Schema capability checks (best-effort; keeps this component drop-in safe across branches)
  const [hasDocs, hasDocViews, hasShareTokens, hasDocAliases, hasOwnerId] = await Promise.all([
    hasTable("docs"),
    hasTable("doc_views"),
    hasTable("share_tokens"),
    hasTable("doc_aliases"),
    hasColumn("docs", "owner_id"),
  ]);

  // Tenant scope: if docs.org_id exists, always restrict to the user's org.
  const orgFilter = hasOrgId && orgId ? sql`and d.org_id = ${orgId}::uuid` : sql``;

  // Viewer scope: only their docs if docs.owner_id exists.
  const ownerFilter = hasOwnerId ? sql`and d.owner_id = ${userId}::uuid` : sql``;

  const docFilter = sql`${orgFilter} ${ownerFilter}`;

  // --- Most viewed this month
  let mostViewed: MostViewed | null = null;
  try {
    if (hasDocs && hasDocViews) {
      const rows = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as title,
          count(*)::int as views
        from public.doc_views v
        join public.docs d on d.id = v.doc_id
        where v.created_at >= date_trunc('month', now())
          ${docFilter}
        group by d.id, d.title
        order by views desc
        limit 1
      `) as unknown as MostViewed[];
      mostViewed = rows[0] ?? null;
    }
  } catch {
    mostViewed = null;
  }

  // --- Recent shares
  let recentShares: RecentShare[] = [];
  try {
    if (hasDocs && hasShareTokens) {
      recentShares = (await sql`
        select
          st.token::text as token,
          d.id::text as doc_id,
          d.title::text as title,
          st.created_at::text as created_at,
          st.expires_at::text as expires_at
        from public.share_tokens st
        join public.docs d on d.id = st.doc_id
        where 1=1
          ${docFilter}
        order by st.created_at desc nulls last
        limit 5
      `) as unknown as RecentShare[];
    }
  } catch {
    recentShares = [];
  }

  // --- Expiring soon (next 7 days)
  const expiring: ExpiringItem[] = [];
  try {
    if (hasDocs && hasShareTokens) {
      const srows = (await sql`
        select
          st.token::text as token_or_alias,
          d.id::text as doc_id,
          d.title::text as doc_title,
          st.expires_at::text as expires_at
        from public.share_tokens st
        join public.docs d on d.id = st.doc_id
        where st.expires_at is not null
          and st.expires_at <= now() + interval '7 days'
          and (st.revoked_at is null)
          ${docFilter}
        order by st.expires_at asc
        limit 5
      `) as unknown as Array<{ token_or_alias: string; doc_id: string; doc_title: string | null; expires_at: string | null }>;

      for (const r of srows) {
        expiring.push({
          kind: "share",
          token_or_alias: r.token_or_alias,
          doc_id: r.doc_id,
          doc_title: r.doc_title,
          expires_at: r.expires_at,
        });
      }
    }
  } catch {
    // ignore
  }

  try {
    if (hasDocs && hasDocAliases) {
      const arows = (await sql`
        select
          da.alias::text as token_or_alias,
          d.id::text as doc_id,
          d.title::text as doc_title,
          da.expires_at::text as expires_at
        from public.doc_aliases da
        join public.docs d on d.id = da.doc_id
        where da.expires_at is not null
          and da.expires_at <= now() + interval '7 days'
          ${docFilter}
        order by da.expires_at asc
        limit 5
      `) as unknown as Array<{ token_or_alias: string; doc_id: string; doc_title: string | null; expires_at: string | null }>;

      for (const r of arows) {
        expiring.push({
          kind: "alias",
          token_or_alias: r.token_or_alias,
          doc_id: r.doc_id,
          doc_title: r.doc_title,
          expires_at: r.expires_at,
        });
      }
    }
  } catch {
    // ignore
  }

  // sort and cap
  expiring.sort((a, b) => {
    const ta = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  const expiringSoon = expiring.slice(0, 5);

  const publicHref = (item: ExpiringItem) => (item.kind === "share" ? `/s/${item.token_or_alias}` : `/d/${item.token_or_alias}`);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">Helpful</div>
          <div className="mt-1 text-xs text-white/60">Quick shortcuts for your own content</div>
        </div>
        <div className="flex gap-2">
          {!hasDocs ? chip("Tracking not enabled") : null}
          {hasOwnerId ? chip("My docs") : chip("No ownership")}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {/* Most viewed */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs font-medium text-white/80">Most viewed (this month)</div>
          {mostViewed ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm text-white">{mostViewed.title ?? "Untitled"}</div>
                <div className="mt-1 text-xs text-white/60">{mostViewed.views} views</div>
              </div>
              <Link className="shrink-0 text-xs text-white/70 hover:text-white" href={`/admin/docs/${mostViewed.doc_id}`}>
                Manage →
              </Link>
            </div>
          ) : (
            <div className="mt-2 text-sm text-white/60">—</div>
          )}
        </div>

        {/* Recent shares */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs font-medium text-white/80">Recent shares</div>
          {recentShares.length ? (
            <div className="mt-2 space-y-2">
              {recentShares.map((s) => (
                <div key={s.token} className="flex items-center justify-between gap-3">
                  <Link className="min-w-0 truncate text-sm text-white hover:underline" href={`/s/${s.token}`}>
                    {s.title ?? "Untitled"}
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 text-xs text-white/60">{fmtDate(s.created_at)}</div>
                    <Link className="shrink-0 text-xs text-white/70 hover:text-white" href={`/admin/docs/${s.doc_id}`}>
                      Manage →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-white/60">—</div>
          )}
        </div>

        {/* Expiring soon */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs font-medium text-white/80">Expiring soon (7 days)</div>
          {expiringSoon.length ? (
            <div className="mt-2 space-y-2">
              {expiringSoon.map((it) => (
                <div key={`${it.kind}:${it.token_or_alias}`} className="flex items-center justify-between gap-3">
                  <Link className="min-w-0 truncate text-sm text-white hover:underline" href={publicHref(it)}>
                    {it.doc_title ?? "Untitled"} <span className="text-xs text-white/50">({it.kind})</span>
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 text-xs text-white/60">{fmtDate(it.expires_at)}</div>
                    <Link className="shrink-0 text-xs text-white/70 hover:text-white" href={`/admin/docs/${it.doc_id}`}>
                      Manage →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-white/60">—</div>
          )}
        </div>
      </div>
    </section>
  );
}
