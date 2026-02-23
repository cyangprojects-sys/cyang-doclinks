// src/app/admin/dashboard/ViewerHelpfulTiles.tsx
import Link from "next/link";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserShape = {
  id: string;
  orgId?: string | null;
  role?: string;
};

type Props = {
  user: UserShape;
  canSeeAll: boolean;

  hasDocs: boolean;
  hasDocViews: boolean;
  hasShareTokens: boolean;
  hasDocAliases: boolean;

  hasOwnerId: boolean;
  hasOrgId: boolean;
};

type MostViewed = { doc_id: string; title: string | null; views: number };
type RecentShare = { token: string; doc_id: string; title: string | null; created_at: string | null; expires_at: string | null };

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
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/80">
      {label}
    </span>
  );
}

export default async function ViewerHelpfulTiles(props: Props) {
  const { user, canSeeAll, hasDocs, hasDocViews, hasShareTokens, hasDocAliases, hasOwnerId, hasOrgId } = props;

  // Tenant scope: if docs.org_id exists, always restrict to the user's org.
  const orgFilter = hasOrgId && user.orgId ? sql`and d.org_id = ${user.orgId}::uuid` : sql``;

  // For viewers, show only their docs if docs.owner_id exists.
  const ownerFilter = !canSeeAll && hasOwnerId ? sql`and d.owner_id = ${user.id}::uuid` : sql``;

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
        from doc_views v
        join docs d on d.id = v.doc_id
        where v.created_at >= date_trunc('month', now())
          ${docFilter}
        group by d.id, d.title
        order by views desc
        limit 1
      `) as unknown as MostViewed[];
      mostViewed = rows?.[0] ?? null;
    }
  } catch {
    mostViewed = null;
  }

  // --- Recent shares
  let recentShares: RecentShare[] = [];
  try {
    if (hasDocs && hasShareTokens) {
      const rows = (await sql`
        select
          st.token::text as token,
          st.doc_id::text as doc_id,
          d.title::text as title,
          st.created_at::text as created_at,
          st.expires_at::text as expires_at
        from share_tokens st
        join docs d on d.id = st.doc_id
        where 1=1
          ${docFilter}
        order by st.created_at desc nulls last
        limit 5
      `) as unknown as RecentShare[];
      recentShares = rows ?? [];
    }
  } catch {
    recentShares = [];
  }

  // --- Expiring soon (next 7 days)
  let expiring: ExpiringItem[] = [];
  try {
    const items: ExpiringItem[] = [];

    if (hasDocs && hasShareTokens) {
      const srows = (await sql`
        select
          st.token::text as token_or_alias,
          st.doc_id::text as doc_id,
          d.title::text as doc_title,
          st.expires_at::text as expires_at
        from share_tokens st
        join docs d on d.id = st.doc_id
        where st.expires_at is not null
          and st.expires_at <= (now() + interval '7 days')
          and st.expires_at >= now()
          ${docFilter}
        order by st.expires_at asc
        limit 5
      `) as unknown as Array<{ token_or_alias: string; doc_id: string; doc_title: string | null; expires_at: string | null }>;

      for (const r of srows ?? []) {
        items.push({
          kind: "share",
          token_or_alias: r.token_or_alias,
          doc_id: r.doc_id,
          doc_title: r.doc_title,
          expires_at: r.expires_at,
        });
      }
    }

    if (hasDocs && hasDocAliases) {
      const arows = (await sql`
        select
          a.alias::text as token_or_alias,
          a.doc_id::text as doc_id,
          d.title::text as doc_title,
          a.expires_at::text as expires_at
        from doc_aliases a
        join docs d on d.id = a.doc_id
        where a.expires_at is not null
          and a.expires_at <= (now() + interval '7 days')
          and a.expires_at >= now()
          ${docFilter}
        order by a.expires_at asc
        limit 5
      `) as unknown as Array<{ token_or_alias: string; doc_id: string; doc_title: string | null; expires_at: string | null }>;

      for (const r of arows ?? []) {
        items.push({
          kind: "alias",
          token_or_alias: r.token_or_alias,
          doc_id: r.doc_id,
          doc_title: r.doc_title,
          expires_at: r.expires_at,
        });
      }
    }

    // Keep it small + stable ordering
    expiring = items
      .sort((a, b) => {
        const ta = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
        return ta - tb;
      })
      .slice(0, 8);
  } catch {
    expiring = [];
  }

  const cardCls = "rounded-2xl border border-white/10 bg-white/5 p-4";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className={cardCls}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Most viewed (this month)</div>
          {chip("Insights")}
        </div>

        {mostViewed ? (
          <div className="space-y-2">
            <div className="text-base text-white">{mostViewed.title || "Untitled document"}</div>
            <div className="text-sm text-white/70">{mostViewed.views.toLocaleString()} views</div>
            <div className="pt-1">
              <Link
                className="text-sm text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white"
                href={`/admin/docs/${mostViewed.doc_id}`}
              >
                Manage →
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-sm text-white/60">No data yet (or tracking not enabled).</div>
        )}
      </div>

      <div className={cardCls}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Recent shares</div>
          {chip("Links")}
        </div>

        {recentShares.length ? (
          <div className="space-y-2">
            {recentShares.map((s) => (
              <div key={s.token} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{s.title || "Untitled document"}</div>
                  <div className="text-xs text-white/60">
                    Created {fmtDate(s.created_at)} • Expires {fmtDate(s.expires_at)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    className="text-xs text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white"
                    href={`/s/${encodeURIComponent(s.token)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </Link>
                  <Link
                    className="text-xs text-white/70 underline decoration-white/20 underline-offset-4 hover:text-white"
                    href={`/admin/docs/${s.doc_id}`}
                  >
                    Manage →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-white/60">No shares yet.</div>
        )}
      </div>

      <div className={cardCls}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Expiring soon</div>
          {chip("Action")}
        </div>

        {expiring.length ? (
          <div className="space-y-2">
            {expiring.map((it) => {
              const openHref = it.kind === "share" ? `/s/${encodeURIComponent(it.token_or_alias)}` : `/d/${encodeURIComponent(it.token_or_alias)}`;
              const openLabel = it.kind === "share" ? "Open share" : "Open view";
              return (
                <div key={`${it.kind}:${it.token_or_alias}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{it.doc_title || "Untitled document"}</div>
                    <div className="text-xs text-white/60">
                      {it.kind === "share" ? "Share" : "View"} • Expires {fmtDate(it.expires_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      className="text-xs text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white"
                      href={openHref}
                      target="_blank"
                      rel="noreferrer"
                      title={openLabel}
                    >
                      Open
                    </Link>
                    <Link
                      className="text-xs text-white/70 underline decoration-white/20 underline-offset-4 hover:text-white"
                      href={`/admin/docs/${it.doc_id}`}
                    >
                      Manage →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-white/60">Nothing expiring in the next 7 days.</div>
        )}
      </div>
    </div>
  );
}
