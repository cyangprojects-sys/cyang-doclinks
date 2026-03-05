// src/app/admin/dashboard/page.tsx
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser, roleAtLeast } from "@/lib/authz";
import { getPlanForUser } from "@/lib/monetization";

import AnalyticsWidgets from "./AnalyticsWidgets";
import ViewsByDocTableClient, { type ViewsByDocRow } from "./ViewsByDocTableClient";
import { type ShareRow } from "./SharesTableClient";
import { type UnifiedDocRow } from "./UnifiedDocsTableClient";
import ViewerHelpfulTiles from "./ViewerHelpfulTiles";
import DashboardItemsTabs from "./DashboardItemsTabs";
import DashboardHeaderActions from "./DashboardHeaderActions";

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

export default async function AdminDashboardPage() {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const canSeeAll = roleAtLeast(u.role, "admin");
  const canCheckEncryptionStatus = roleAtLeast(u.role, "owner");
  const userPlan = await getPlanForUser(u.id);
  const planId = String(userPlan.id || "free").toLowerCase() === "free" ? "free" : "pro";
  const nowTs = Date.now();

  const hasDocs = await tableExists("public.docs");
  const hasDocViews = await tableExists("public.doc_views");
  const hasShareTokens = await tableExists("public.share_tokens");
  const hasDocAliases = await tableExists("public.doc_aliases");
  const hasOwnerId = await columnExists("docs", "owner_id");
  const hasOrgId = await columnExists("docs", "org_id");
  const hasCreatedByEmail = await columnExists("docs", "created_by_email");

  // Tenant scope: if docs.org_id exists, always restrict to the user's org.
// This prevents cross-tenant data leaks in multi-tenant mode.
const orgFilter = hasOrgId && u.orgId ? sql`and d.org_id = ${u.orgId}::uuid` : sql``;

// For viewers, show only their docs.
// Legacy fallback: owner_id may be null on older rows; use created_by_email in that case.
const ownerFilter = !canSeeAll
  ? hasOwnerId
    ? hasCreatedByEmail
      ? sql`and (d.owner_id = ${u.id}::uuid or (d.owner_id is null and lower(coalesce(d.created_by_email,'')) = lower(${u.email})))`
      : sql`and d.owner_id = ${u.id}::uuid`
    : hasCreatedByEmail
      ? sql`and lower(coalesce(d.created_by_email,'')) = lower(${u.email})`
      : sql``
  : sql``;

const docFilter = sql`${orgFilter} ${ownerFilter}`;

  // --- Unified docs table (doc meta + totals + shares + alias status)
  let unifiedRows: UnifiedDocRow[] = [];
  try {
    if (hasDocs) {
      unifiedRows = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as doc_title,
          coalesce(d.status::text, 'ready') as doc_state,
          a.alias::text as alias,
          coalesce(d.scan_status::text, 'unscanned') as scan_status,
          coalesce(d.moderation_status::text, 'active') as moderation_status,
          coalesce(v.total_views, 0)::int as total_views,
          v.last_view::text as last_view,
          coalesce(s.active_shares, 0)::int as active_shares,
          a.expires_at::text as alias_expires_at,
          a.is_active as alias_is_active,
          a.revoked_at::text as alias_revoked_at
        from public.docs d
        left join lateral (
          select
            da.alias,
            da.expires_at,
            da.is_active,
            da.revoked_at
          from public.doc_aliases da
          where da.doc_id = d.id
          order by da.created_at desc nulls last
          limit 1
        ) a on true
        left join lateral (
          select
            count(*)::int as total_views,
            max(vv.created_at) as last_view
          from public.doc_views vv
          where vv.doc_id = d.id
        ) v on true
        left join lateral (
          select
            count(*)::int as active_shares
          from public.share_tokens st
          where st.doc_id = d.id
            and st.revoked_at is null
            and (st.expires_at is null or st.expires_at > now())
            and (
              st.max_views is null
              or st.max_views = 0
              or coalesce(st.views_count, 0) < st.max_views
            )
        ) s on true
        where 1=1
          and lower(coalesce(d.status::text, 'ready')) <> 'deleted'
          ${docFilter}
        order by coalesce(v.total_views, 0) desc, d.created_at desc
      `) as unknown as UnifiedDocRow[];
    }
  } catch {
    unifiedRows = [];
  }

  // --- Views by doc table (views + unique IPs + last view)
  let viewsRows: ViewsByDocRow[] = [];
  try {
    if (hasDocs && hasDocViews) {
      viewsRows = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as doc_title,
          a.alias::text as alias,
          coalesce(d.scan_status::text, 'unscanned') as scan_status,
          count(v.id)::int as views,
          count(distinct v.ip_hash)::int as unique_ips,
          max(v.created_at)::text as last_view
        from public.docs d
        left join public.doc_views v on v.doc_id = d.id
        left join lateral (
          select da.alias
          from public.doc_aliases da
          where da.doc_id = d.id
          order by da.created_at desc nulls last
          limit 1
        ) a on true
        where 1=1
          and coalesce(d.status::text, 'ready') = 'ready'
          ${docFilter}
        group by d.id, d.title, a.alias
        order by views desc, last_view desc nulls last
      `) as unknown as ViewsByDocRow[];
    }
  } catch {
    viewsRows = [];
  }

  // --- Shares table
  let shares: ShareRow[] = [];
  try {
    if (hasShareTokens && hasDocs) {
      shares = (await sql`
        select
          st.token::text as token,
          st.doc_id::text as doc_id,
          st.to_email::text as to_email,
          st.created_at::text as created_at,
          st.expires_at::text as expires_at,
          st.max_views as max_views,
          coalesce(st.views_count, 0)::int as view_count,
          st.revoked_at::text as revoked_at,
          d.title::text as doc_title,
          a.alias::text as alias,
          (st.password_hash is not null)::boolean as has_password
        from public.share_tokens st
        join public.docs d on d.id = st.doc_id
        left join lateral (
          select da.alias
          from public.doc_aliases da
          where da.doc_id = d.id
          order by da.created_at desc nulls last
          limit 1
        ) a on true
        where 1=1
          ${docFilter}
        order by st.created_at desc
        limit 2000
      `) as unknown as ShareRow[];
    }
  } catch {
    shares = [];
  }

  const missingCoreTables = !hasDocs || (!hasDocViews && !hasShareTokens);
  const headerDocs = unifiedRows.map((r) => ({
    docId: r.doc_id,
    title: r.doc_title || "Untitled document",
    docState: r.doc_state,
    scanState: r.scan_status,
    moderationStatus: r.moderation_status,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <div className="mt-1 text-sm text-white/65">Your protected documents and links</div>
        </div>
        <DashboardHeaderActions docs={headerDocs} planId={planId} />
      </div>

      <AnalyticsWidgets ownerId={canSeeAll ? undefined : u.id} userId={u.id} showHealth={u.role === "owner"} />

      {missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Setup incomplete</div>
          <div className="mt-1 text-neutral-400">
            Your database is missing one or more tables required for dashboard analytics.
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-neutral-400">
            <li>public.docs: {hasDocs ? "ok" : "missing"}</li>
            <li>public.doc_views: {hasDocViews ? "ok" : "missing"}</li>
            <li>public.share_tokens: {hasShareTokens ? "ok" : "missing"}</li>
            <li>public.doc_aliases: {hasDocAliases ? "ok" : "missing"}</li>
          </ul>
        </div>
      ) : null}

      {!canSeeAll ? (
        <section id="activity" className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <a className="text-xs text-neutral-500 hover:underline" href="#views-by-doc">
              view activity details →
            </a>
          </div>
          <div className="grid gap-4 lg:grid-cols-1">
            <ViewerHelpfulTiles userId={u.id} orgId={u.orgId} hasOrgId={hasOrgId} />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Your items</h2>
          <a className="text-xs text-neutral-500 hover:underline" href="#shares">
            jump to settings →
          </a>
        </div>
        <DashboardItemsTabs
          docs={unifiedRows}
          shares={shares}
          nowTs={nowTs}
          canManageBulk={canSeeAll}
          canCheckEncryptionStatus={canCheckEncryptionStatus}
          showDelete={canSeeAll || hasOwnerId || hasCreatedByEmail}
        />
      </section>

      {/* Views by doc */}
      <section id="views-by-doc" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Views by document</h2>
          <a className="text-xs text-neutral-500 hover:underline" href="#settings">
            jump to settings →
          </a>
        </div>
        <ViewsByDocTableClient rows={viewsRows} canManageShares={canSeeAll} />
      </section>

      <section id="settings" className="space-y-3">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
          <div className="font-medium text-white">Pro unlocks</div>
          <div className="mt-1">Unlock expiring links, access modes, and audit export.</div>
          <a href="/admin/upgrade" className="mt-3 inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15">
            See Pro features
          </a>
        </div>
      </section>
    </div>
  );
}
