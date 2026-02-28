// src/app/admin/dashboard/page.tsx
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser, roleAtLeast } from "@/lib/authz";

import UploadPanel from "./UploadPanel";
import AnalyticsWidgets from "./AnalyticsWidgets";
import ViewsByDocTableClient, { type ViewsByDocRow } from "./ViewsByDocTableClient";
import SharesTableClient, { type ShareRow } from "./SharesTableClient";
import UnifiedDocsTableClient, { type UnifiedDocRow } from "./UnifiedDocsTableClient";
import ViewerUsageWidget from "./ViewerUsageWidget";
import ViewerHelpfulTiles from "./ViewerHelpfulTiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

<<<<<<< ours
async function tableExists(fqTable: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${fqTable})::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
=======
type DocRow = {
    id: string;
    title: string | null;
    created_at: string;
    alias: string | null;
};

type ShareRow = {
    token: string; // uuid text
    doc_id: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    views_count: number | null;
    revoked_at: string | null;
    doc_title: string | null;
    alias: string | null;
    has_password: boolean;
};

type AccessRow = {
    accessed_at: string;
    doc_id: string;
    doc_title: string | null;
    alias: string | null;
    share_id: string | null;
    email_used: string | null;
    ip: string | null;
    device_hash: string | null;
    user_agent: string | null;
};

type ViewsByDocRow = {
    doc_id: string;
    doc_title: string | null;
    alias: string | null;
    views: number;
    unique_ips: number;
    last_view: string | null;
};

type DailyAggRow = {
    date: string;
    view_count: number;
    unique_ip_count: number;
};

function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
>>>>>>> theirs
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
          a.alias::text as alias,
          coalesce(d.scan_status::text, 'unscanned') as scan_status,
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
          and coalesce(d.status::text, 'ready') = 'ready'
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
<<<<<<< ours
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

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="hidden text-xs text-neutral-500 md:block">
          {u.email} · role: {u.role}
        </div>
      </div>

      <AnalyticsWidgets ownerId={canSeeAll ? undefined : u.id} />

      {/* Usage + quick actions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ViewerUsageWidget userId={u.id} />
        {!canSeeAll ? <ViewerHelpfulTiles userId={u.id} orgId={u.orgId} hasOrgId={hasOrgId} /> : null}
      </div>

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

      {/* Upload */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upload</h2>
        <UploadPanel canCheckEncryptionStatus={canCheckEncryptionStatus} />
      </section>

      {/* Unified docs */}
      <section id="docs" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Documents</h2>
          <a className="text-xs text-neutral-500 hover:underline" href="#views-by-doc">
            jump to views →
          </a>
        </div>
        {/* Viewers can delete own docs using owner_id, with created_by_email fallback for legacy rows. */}
        <UnifiedDocsTableClient rows={unifiedRows} defaultPageSize={10} showDelete={canSeeAll || hasOwnerId || hasCreatedByEmail} />
      </section>

      {/* Views by doc */}
      <section id="views-by-doc" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Views by document</h2>
          <a className="text-xs text-neutral-500 hover:underline" href="#shares">
            jump to shares →
          </a>
        </div>
        <ViewsByDocTableClient rows={viewsRows} />
      </section>

      {/* Shares */}
      <section id="shares" className="space-y-3">
        <h2 className="text-lg font-semibold">Shares</h2>
        <SharesTableClient shares={shares} nowTs={nowTs} />
      </section>
    </div>
  );
=======

    // Daily aggregation summary (best-effort; table may not exist)
    let dailyAgg: DailyAggRow[] = [];
    try {
        dailyAgg = (await sql`
      select
        date::text as date,
        sum(view_count)::int as view_count,
        sum(unique_ip_count)::int as unique_ip_count
      from public.doc_view_daily
      where date >= (current_date - interval '14 days')
      group by date
      order by date desc
    `) as unknown as DailyAggRow[];
    } catch {
        dailyAgg = [];
    }

    const sharesClient: ShareRowClient[] = shares.map((s) => ({
        token: s.token,
        doc_id: s.doc_id,
        to_email: s.to_email,
        created_at: s.created_at,
        expires_at: s.expires_at,
        max_views: s.max_views,
        view_count: Number(s.views_count ?? 0),
        revoked_at: s.revoked_at,
        doc_title: s.doc_title,
        alias: s.alias,
        has_password: Boolean(s.has_password),
    }));

    return (
        <main className="mx-auto max-w-6xl px-4 py-12">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Admin dashboard</h1>
                    <p className="mt-1 text-sm text-neutral-400">Owner-only tools.</p>
                </div>

                <Link
                    href="/admin"
                    className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
                >
                    Back to Admin
                </Link>

                <Link
                    href="/admin/audit"
                    className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
                >
                    Audit logs
                </Link>
            </div>

            {/* ✅ UPLOAD */}
            <UploadPanel />

            {/* DOCS */}
            <div className="mt-8 overflow-hidden rounded-lg border border-neutral-800">
                <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                        <tr>
                            <th className="px-4 py-3 text-left">Title</th>
                            <th className="px-4 py-3 text-left">Alias</th>
                            <th className="px-4 py-3 text-left">Created</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {docs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-6 text-neutral-400">
                                    No documents found.
                                </td>
                            </tr>
                        ) : (
                            docs.map((doc) => (
                                <tr key={doc.id} className="border-t border-neutral-800">
                                    <td className="px-4 py-3">
                                        {doc.title || "Untitled"}
                                        <div className="text-xs text-neutral-500 font-mono">{doc.id}</div>
                                    </td>

                                    <td className="px-4 py-3">
                                        {doc.alias ? (
                                            <Link
                                                href={`/d/${doc.alias}`}
                                                className="text-blue-400 hover:underline"
                                                target="_blank"
                                            >
                                                {doc.alias}
                                            </Link>
                                        ) : (
                                            <span className="text-neutral-500">—</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 text-neutral-400">
                                        {new Date(doc.created_at).toLocaleString()}
                                    </td>

                                    <td className="px-4 py-3 text-right">
                                        <DeleteDocForm
                                            docId={doc.id}
                                            title={doc.title || "Untitled"}
                                            action={deleteDocAction}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SHARES */}
            <div className="mt-10">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Shares</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Token, recipient, expiration, max views, views, password, revoke.
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                        Showing latest {Math.min(sharesClient.length, 500)}
                    </div>
                </div>

                <SharesTableClient
                    shares={sharesClient}
                    revokeAction={revokeDocShareAction}
                    setPasswordAction={setSharePasswordAction}
                    clearPasswordAction={clearSharePasswordAction}
                />
            </div>

            {/* VIEWS / AUDIT */}
            <div className="mt-12">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Views / audit</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Latest access logs (best-effort). This is what makes the product feel “in control”.
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                        Total: {accessSummary.total} · Unique devices: {accessSummary.uniques}
                        {accessSummary.last ? (
                            <> · Last: {new Date(accessSummary.last).toLocaleString()}</>
                        ) : null}
                    </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
                    <div className="max-h-[560px] overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                            <tr>
                                <th className="px-4 py-3 text-left">When</th>
                                <th className="px-4 py-3 text-left">Doc</th>
                                <th className="px-4 py-3 text-left">Alias</th>
                                <th className="px-4 py-3 text-left">Share</th>
                                <th className="px-4 py-3 text-left">Email used</th>
                                <th className="px-4 py-3 text-left">IP</th>
                                <th className="px-4 py-3 text-left">Device</th>
                            </tr>
                            </thead>
                            <tbody>
                            {access.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-neutral-400">
                                        No access logs found (or table not available).
                                    </td>
                                </tr>
                            ) : (
                                access.map((r, idx) => (
                                    <tr key={`${r.doc_id}-${r.accessed_at}-${idx}`} className="border-t border-neutral-800">
                                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
                                            {fmtDate(r.accessed_at)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.doc_title || "Untitled"}
                                            <div className="text-xs text-neutral-500 font-mono">{r.doc_id}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.alias ? (
                                                <Link href={`/d/${r.alias}`} target="_blank" className="text-blue-400 hover:underline">
                                                    {r.alias}
                                                </Link>
                                            ) : (
                                                <span className="text-neutral-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.share_id ? (
                                                <Link href={`/s/${r.share_id}`} target="_blank" className="text-blue-400 hover:underline">
                                                    {r.share_id}
                                                </Link>
                                            ) : (
                                                <span className="text-neutral-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-300">
                                            {r.email_used || <span className="text-neutral-500">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                                            {r.ip || <span className="text-neutral-500">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                                            {r.device_hash || <span className="text-neutral-500">—</span>}
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* VIEW COUNTS */}
            <div className="mt-12">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">View counts per doc</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Top documents by total views (best-effort; uses <span className="font-mono">doc_views</span>).
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                        {viewsByDoc.length ? `Top ${Math.min(viewsByDoc.length, 50)}` : "—"}
                    </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
                    <div className="max-h-[560px] overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                                <tr>
                                    <th className="px-4 py-3 text-left">Doc</th>
                                    <th className="px-4 py-3 text-left">Alias</th>
                                    <th className="px-4 py-3 text-right">Views</th>
                                    <th className="px-4 py-3 text-right">Unique IPs</th>
                                    <th className="px-4 py-3 text-right">Last view</th>
                                </tr>
                            </thead>
                            <tbody>
                                {viewsByDoc.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-neutral-400">
                                            No view data found (or table not available).
                                        </td>
                                    </tr>
                                ) : (
                                    viewsByDoc.map((r) => (
                                        <tr key={r.doc_id} className="border-t border-neutral-800">
                                            <td className="px-4 py-3">
                                                <div className="text-neutral-200">{r.doc_title || "Untitled"}</div>
                                                <div className="text-xs text-neutral-500 font-mono">{r.doc_id}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {r.alias ? (
                                                    <Link href={`/d/${r.alias}`} target="_blank" className="text-blue-400 hover:underline">
                                                        /d/{r.alias}
                                                    </Link>
                                                ) : (
                                                    <span className="text-neutral-500">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{r.views}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{r.unique_ips}</td>
                                            <td className="px-4 py-3 text-right text-neutral-400 whitespace-nowrap">
                                                {fmtDate(r.last_view)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* DAILY ANALYTICS */}
            <div className="mt-12">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Daily analytics (last 14 days)</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Reads from <span className="font-mono">doc_view_daily</span>. Generate/refresh via{" "}
                            <Link className="text-blue-400 hover:underline" href="/api/admin/analytics/aggregate" target="_blank">
                                /api/admin/analytics/aggregate
                            </Link>
                            .
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                        <Link
                            className="text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
                            href="/api/admin/retention/run"
                            target="_blank"
                        >
                            Run retention
                        </Link>
                    </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
                    <div className="max-h-[560px] overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                                <tr>
                                    <th className="px-4 py-3 text-left">Day</th>
                                    <th className="px-4 py-3 text-right">Views</th>
                                    <th className="px-4 py-3 text-right">Unique IPs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyAgg.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-6 text-neutral-400">
                                            No daily analytics found (or table not available).
                                        </td>
                                    </tr>
                                ) : (
                                    dailyAgg.map((r) => (
                                        <tr key={r.date} className="border-t border-neutral-800">
                                            <td className="px-4 py-3 text-neutral-200 font-mono text-xs">{r.date}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{r.view_count}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{r.unique_ip_count}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    );
>>>>>>> theirs
}
