// src/app/admin/dashboard/ViewerHelpfulTiles.tsx
import Link from "next/link";
import { sql } from "@/lib/db";

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

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

type RecentShare = {
  token: string;
  doc_title: string | null;
  alias: string | null;
  created_at: string | null;
};

type ExpiringItem = {
  kind: "share" | "alias";
  token_or_alias: string;
  doc_title: string | null;
  expires_at: string | null;
};

export default async function ViewerHelpfulTiles(props: { userId: string; orgId: string | null; hasOrgId: boolean }) {
  const userId = String(props.userId || "").trim();
  if (!userId) return null;

  const hasDocs = await tableExists("public.docs");
  const hasShares = await tableExists("public.share_tokens");
  const hasAliases = await tableExists("public.doc_aliases");
  const hasViews = await tableExists("public.doc_views");
  const hasOwnerId = hasDocs ? await columnExists("docs", "owner_id") : false;

  if (!hasDocs || !hasOwnerId) {
    return (
      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-medium text-neutral-100">Helpful</div>
        <div className="mt-1 text-xs text-neutral-500">
          Owner-scoped tiles will appear once the ownership columns are deployed.
        </div>
      </section>
    );
  }

  const orgFilter = props.hasOrgId && props.orgId ? sql`and d.org_id = ${props.orgId}::uuid` : sql``;
  const ownerFilter = sql`and d.owner_id = ${userId}::uuid`;
  const docFilter = sql`${orgFilter} ${ownerFilter}`;

  let recentShares: RecentShare[] = [];
  let expiringSoon: ExpiringItem[] = [];
  let topDocThisMonth: { doc_id: string; doc_title: string | null; views: number } | null = null;

  // Recent shares (last 5)
  if (hasShares) {
    try {
      recentShares = (await sql`
        select
          st.token::text as token,
          d.title::text as doc_title,
          da.alias::text as alias,
          st.created_at::text as created_at
        from public.share_tokens st
        join public.docs d on d.id = st.doc_id
        left join lateral (
          select alias
          from public.doc_aliases da
          where da.doc_id = d.id
          order by da.created_at desc nulls last
          limit 1
        ) da on true
        where 1=1
          ${docFilter}
        order by st.created_at desc
        limit 5
      `) as unknown as RecentShare[];
    } catch {
      recentShares = [];
    }
  }

  // Expiring soon (shares + aliases in next 7 days)
  try {
    const items: ExpiringItem[] = [];

    if (hasShares) {
      const srows = (await sql`
        select
          'share'::text as kind,
          st.token::text as token_or_alias,
          d.title::text as doc_title,
          st.expires_at::text as expires_at
        from public.share_tokens st
        join public.docs d on d.id = st.doc_id
        where 1=1
          ${docFilter}
          and st.revoked_at is null
          and st.expires_at is not null
          and st.expires_at > now()
          and st.expires_at <= now() + interval '7 days'
        order by st.expires_at asc
        limit 5
      `) as unknown as ExpiringItem[];
      items.push(...srows.map((r) => ({ ...r, kind: "share" })));
    }

    if (hasAliases) {
      const arows = (await sql`
        select
          'alias'::text as kind,
          da.alias::text as token_or_alias,
          d.title::text as doc_title,
          da.expires_at::text as expires_at
        from public.doc_aliases da
        join public.docs d on d.id = da.doc_id
        where 1=1
          ${docFilter}
          and (da.revoked_at is null)
          and (da.is_active is null or da.is_active = true)
          and da.expires_at is not null
          and da.expires_at > now()
          and da.expires_at <= now() + interval '7 days'
        order by da.expires_at asc
        limit 5
      `) as unknown as ExpiringItem[];
      items.push(...arows.map((r) => ({ ...r, kind: "alias" })));
    }

    items.sort((x, y) => {
      const tx = x.expires_at ? Date.parse(x.expires_at) : Number.POSITIVE_INFINITY;
      const ty = y.expires_at ? Date.parse(y.expires_at) : Number.POSITIVE_INFINITY;
      return tx - ty;
    });

    expiringSoon = items.slice(0, 6);
  } catch {
    expiringSoon = [];
  }

  // Most viewed doc this month
  if (hasViews) {
    try {
      const rows = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as doc_title,
          count(v.id)::int as views
        from public.docs d
        join public.doc_views v on v.doc_id = d.id
        where 1=1
          ${docFilter}
          and v.created_at >= date_trunc('month', now())
        group by d.id, d.title
        order by views desc
        limit 1
      `) as unknown as Array<{ doc_id: string; doc_title: string | null; views: number }>;
      topDocThisMonth = rows?.[0] ?? null;
    } catch {
      topDocThisMonth = null;
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-neutral-100">Helpful</div>
          <div className="mt-0.5 text-xs text-neutral-500">Quick view into your shares & activity</div>
        </div>
        <a
          href="#docs"
          className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
        >
          View docs
        </a>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {/* Tile 1: Most viewed this month */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Most viewed (this month)</div>
          {topDocThisMonth ? (
            <div className="mt-2">
              <div className="text-sm font-medium text-neutral-100">
                <Link href={`/admin/docs/${topDocThisMonth.doc_id}`} className="hover:underline">
                  {topDocThisMonth.doc_title || "Untitled"}
                </Link>
              </div>
              <div className="mt-1 text-xs text-neutral-500">{topDocThisMonth.views} views</div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-neutral-400">No view data yet.</div>
          )}
        </div>

        {/* Tile 2: Recent shares */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Recent shares</div>
          {recentShares.length ? (
            <div className="mt-2 space-y-2">
              {recentShares.map((s) => (
                <div key={s.token} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-100">{s.doc_title || s.alias || "Untitled"}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-neutral-500">/s/{s.token}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-neutral-500">{fmtDate(s.created_at)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-neutral-400">No shares created yet.</div>
          )}
          <div className="mt-3">
            <a className="text-xs text-blue-400 hover:underline" href="#shares">
              Go to shares →
            </a>
          </div>
        </div>

        {/* Tile 3: Expiring soon */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Expiring soon (7 days)</div>
          {expiringSoon.length ? (
            <div className="mt-2 space-y-2">
              {expiringSoon.map((x) => (
                <div key={`${x.kind}:${x.token_or_alias}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-100">{x.doc_title || "Untitled"}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-neutral-500">
                      {x.kind === "share" ? `/s/${x.token_or_alias}` : `/d/${x.token_or_alias}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-neutral-500">{fmtDate(x.expires_at)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-neutral-400">Nothing expiring soon.</div>
          )}
          <div className="mt-3 text-xs text-neutral-500">
            Tip: For shares, re-share if a link expires.
          </div>
        </div>
      </div>
    </section>
  );
}
