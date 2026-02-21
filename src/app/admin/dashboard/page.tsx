// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getAuthedUser } from "@/lib/authz";
import {
    updateRetentionSettingsAction,
    sendExpirationAlertAction,
} from "../actions";
import SharesTableClient, { type ShareRow as ShareRowClient } from "./SharesTableClient";
import UploadPanel from "./UploadPanel";
import ViewsByDocTableClient, { type ViewsByDocRow as ViewsByDocRowClient } from "./ViewsByDocTableClient";
import UnifiedDocsTableClient, { type UnifiedDocRow as UnifiedDocRowClient } from "./UnifiedDocsTableClient";
import { getRetentionSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type UnifiedDocRow = {
    doc_id: string;
    doc_title: string | null;
    alias: string | null;
    total_views: number;
    last_view: string | null;
    active_shares: number;
    alias_expires_at: string | null;
    alias_is_active: boolean | null;
    alias_revoked_at: string | null;
};

type DailyAggRow = {
    day: string;
    views: number;
    unique_ips: number;
};

type TopDocRow = {
    doc_id: string;
    doc_title: string | null;
    alias: string | null;
    views_7d: number;
    unique_ips_7d: number;
};

type SparkRow = {
    day: string;
    views: number;
};

function Sparkline({ values }: { values: number[] }) {
    const w = 140;
    const h = 36;
    const pad = 3;
    const n = values.length;
    if (n === 0) return <div className="text-xs text-neutral-500">—</div>;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const points = values
        .map((v, i) => {
            const x = pad + (i * (w - pad * 2)) / Math.max(1, n - 1);
            const y = pad + (1 - (v - min) / span) * (h - pad * 2);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");

    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
            <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
                className="text-neutral-200"
            />
        </svg>
    );
}

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

export default async function AdminDashboardPage() {
    const u = await getAuthedUser();
    if (!u) redirect("/api/auth/signin");
    const canSeeAll = u.role === "owner" || u.role === "admin";

    const docs = (await (canSeeAll
        ? sql`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      a.alias
    from docs d
    left join doc_aliases a on a.doc_id = d.id
    order by d.created_at desc
  `
        : sql`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      a.alias
    from docs d
    left join doc_aliases a on a.doc_id = d.id
    where d.owner_id = ${u.id}::uuid
    order by d.created_at desc
  `)) as unknown as DocRow[];

    const shares = (await (canSeeAll
        ? sql`
    select
      s.token::text as token,
      s.doc_id::text as doc_id,
      s.to_email,
      s.created_at::text as created_at,
      s.expires_at::text as expires_at,
      s.max_views,
      s.views_count,
      s.revoked_at::text as revoked_at,
      (s.password_hash is not null) as has_password,
      d.title as doc_title,
      a.alias
    from share_tokens s
    join docs d on d.id = s.doc_id
    left join doc_aliases a on a.doc_id = s.doc_id
    order by s.created_at desc
    limit 500
  `
        : sql`
    select
      s.token::text as token,
      s.doc_id::text as doc_id,
      s.to_email,
      s.created_at::text as created_at,
      s.expires_at::text as expires_at,
      s.max_views,
      s.views_count,
      s.revoked_at::text as revoked_at,
      (s.password_hash is not null) as has_password,
      d.title as doc_title,
      a.alias
    from share_tokens s
    join docs d on d.id = s.doc_id
    left join doc_aliases a on a.doc_id = s.doc_id
    where d.owner_id = ${u.id}::uuid
    order by s.created_at desc
    limit 500
  `)) as unknown as ShareRow[];

    const hasDocAccessLog = await tableExists("public.doc_access_log");
    const hasDocAudit = await tableExists("public.doc_audit");

    // Recent access logs (best-effort; table may not exist in older envs)
    // For viewers, scope to *their* docs. For owner/admin, show site-wide.
    let access: AccessRow[] = [];
    try {
        if (hasDocAccessLog) {
            access = (await (canSeeAll
                ? sql`
        select
          l.accessed_at::text as accessed_at,
          l.doc_id::text as doc_id,
          d.title as doc_title,
          l.alias::text as alias,
          l.share_id::text as share_id,
          l.email_used::text as email_used,
          l.ip::text as ip,
          l.device_hash::text as device_hash,
          l.user_agent::text as user_agent
        from public.doc_access_log l
        join public.docs d on d.id = l.doc_id
        order by l.accessed_at desc
        limit 200
      `
                : sql`
        select
          l.accessed_at::text as accessed_at,
          l.doc_id::text as doc_id,
          d.title as doc_title,
          l.alias::text as alias,
          l.share_id::text as share_id,
          l.email_used::text as email_used,
          l.ip::text as ip,
          l.device_hash::text as device_hash,
          l.user_agent::text as user_agent
        from public.doc_access_log l
        join public.docs d on d.id = l.doc_id
        where d.owner_id = ${u.id}::uuid
        order by l.accessed_at desc
        limit 200
      `)) as unknown as AccessRow[];
        } else if (hasDocAudit) {
            // logDocAccess() writes to doc_audit by default in this repo.
            access = (await (canSeeAll
                ? sql`
        select
          a.created_at::text as accessed_at,
          a.doc_id::text as doc_id,
          d.title as doc_title,
          a.alias::text as alias,
          a.share_id::text as share_id,
          a.email_used::text as email_used,
          null::text as ip,
          null::text as device_hash,
          a.user_agent::text as user_agent
        from public.doc_audit a
        join public.docs d on d.id = a.doc_id
        order by a.created_at desc
        limit 200
      `
                : sql`
        select
          a.created_at::text as accessed_at,
          a.doc_id::text as doc_id,
          d.title as doc_title,
          a.alias::text as alias,
          a.share_id::text as share_id,
          a.email_used::text as email_used,
          null::text as ip,
          null::text as device_hash,
          a.user_agent::text as user_agent
        from public.doc_audit a
        join public.docs d on d.id = a.doc_id
        where d.owner_id = ${u.id}::uuid
        order by a.created_at desc
        limit 200
      `)) as unknown as AccessRow[];
        }
    } catch {
        access = [];
    }

    // Summary metrics (best-effort)
let accessSummary: { total: number; uniques: number; last: string | null } = {
    total: 0,
    uniques: 0,
    last: null,
};
try {
    const rows = hasDocAccessLog
        ? ((await (canSeeAll
            ? sql`
    select
      count(*)::int as total,
      count(distinct coalesce(device_hash, ''))::int as uniques,
      max(accessed_at)::text as last
    from public.doc_access_log
  `
            : sql`
    select
      count(*)::int as total,
      count(distinct coalesce(l.device_hash, ''))::int as uniques,
      max(l.accessed_at)::text as last
    from public.doc_access_log l
    join public.docs d on d.id = l.doc_id
    where d.owner_id = ${u.id}::uuid
  `)) as unknown as Array<{ total: number; uniques: number; last: string | null }>)
        : hasDocAudit
          ? ((await (canSeeAll
                ? sql`
    select
      count(*)::int as total,
      0::int as uniques,
      max(created_at)::text as last
    from public.doc_audit
  `
                : sql`
    select
      count(*)::int as total,
      0::int as uniques,
      max(a.created_at)::text as last
    from public.doc_audit a
    join public.docs d on d.id = a.doc_id
    where d.owner_id = ${u.id}::uuid
  `)) as unknown as Array<{ total: number; uniques: number; last: string | null }>)
          : ([] as Array<{ total: number; uniques: number; last: string | null }>);
    if (rows?.[0]) accessSummary = rows[0];
} catch {
    // ignore
}

    // View count per doc (best-effort; doc_views may not exist)
let viewsByDoc: ViewsByDocRow[] = [];
try {
    viewsByDoc = (await (canSeeAll
        ? sql`
  select
    v.doc_id::text as doc_id,
    d.title as doc_title,
    a.alias as alias,
    count(*)::int as views,
    count(distinct coalesce(v.ip_hash, ''))::int as unique_ips,
    max(v.created_at)::text as last_view
  from public.doc_views v
  join public.docs d on d.id = v.doc_id
  left join public.doc_aliases a on a.doc_id = v.doc_id
  group by v.doc_id, d.title, a.alias
  order by views desc
  limit 50
`
        : sql`
  select
    v.doc_id::text as doc_id,
    d.title as doc_title,
    a.alias as alias,
    count(*)::int as views,
    count(distinct coalesce(v.ip_hash, ''))::int as unique_ips,
    max(v.created_at)::text as last_view
  from public.doc_views v
  join public.docs d on d.id = v.doc_id
  left join public.doc_aliases a on a.doc_id = v.doc_id
  where d.owner_id = ${u.id}::uuid
  group by v.doc_id, d.title, a.alias
  order by views desc
  limit 50
`)) as unknown as ViewsByDocRow[];
} catch {
    viewsByDoc = [];
}

    // Unified documents table (best-effort)
let unifiedDocs: UnifiedDocRow[] = [];
try {
    unifiedDocs = (await (canSeeAll
        ? sql`
  select
    d.id::text as doc_id,
    d.title as doc_title,
    a.alias as alias,
    coalesce(v.total_views, 0)::int as total_views,
    v.last_view::text as last_view,
    coalesce(s.active_shares, 0)::int as active_shares,
    a.expires_at::text as alias_expires_at,
    coalesce(a.is_active, true) as alias_is_active,
    a.revoked_at::text as alias_revoked_at
  from public.docs d
  left join public.doc_aliases a on a.doc_id = d.id
  left join lateral (
    select
      count(*)::int as total_views,
      max(created_at)::timestamptz as last_view
    from public.doc_views v
    where v.doc_id = d.id
  ) v on true
  left join lateral (
    select
      count(*)::int as active_shares
    from public.share_tokens st
    where st.doc_id = d.id
      and st.revoked_at is null
      and (st.expires_at is null or st.expires_at > now())
      and (st.max_views is null or st.views_count is null or st.views_count < st.max_views)
  ) s on true
  order by total_views desc, d.created_at desc
  limit 500
`
        : sql`
  select
    d.id::text as doc_id,
    d.title as doc_title,
    a.alias as alias,
    coalesce(v.total_views, 0)::int as total_views,
    v.last_view::text as last_view,
    coalesce(s.active_shares, 0)::int as active_shares,
    a.expires_at::text as alias_expires_at,
    coalesce(a.is_active, true) as alias_is_active,
    a.revoked_at::text as alias_revoked_at
  from public.docs d
  left join public.doc_aliases a on a.doc_id = d.id
  left join lateral (
    select
      count(*)::int as total_views,
      max(created_at)::timestamptz as last_view
    from public.doc_views v
    where v.doc_id = d.id
  ) v on true
  left join lateral (
    select
      count(*)::int as active_shares
    from public.share_tokens st
    where st.doc_id = d.id
      and st.revoked_at is null
      and (st.expires_at is null or st.expires_at > now())
      and (st.max_views is null or st.views_count is null or st.views_count < st.max_views)
  ) s on true
  where d.owner_id = ${u.id}::uuid
  order by total_views desc, d.created_at desc
  limit 500
`)) as unknown as UnifiedDocRow[];
} catch {
    // Fallback: show docs list without metrics
    unifiedDocs = docs.map((d) => ({
        doc_id: d.id,
        doc_title: d.title,
        alias: d.alias,
        total_views: 0,
        last_view: null,
        active_shares: 0,
        alias_expires_at: null,
        alias_is_active: true,
        alias_revoked_at: null,
    }));
}

    // Expiration warnings (aliases expiring in next 3 days)
    let expiringSoon: Array<{ doc_id: string; doc_title: string | null; alias: string | null; expires_at: string | null }> = [];
    try {
        expiringSoon = (await (canSeeAll
            ? sql`
      select
        d.id::text as doc_id,
        d.title as doc_title,
        a.alias as alias,
        a.expires_at::text as expires_at
      from public.doc_aliases a
      join public.docs d on d.id = a.doc_id
      where coalesce(a.is_active, true) = true
        and a.revoked_at is null
        and a.expires_at is not null
        and a.expires_at > now()
        and a.expires_at <= (now() + interval '3 days')
      order by a.expires_at asc
      limit 8
    `
            : sql`
      select
        d.id::text as doc_id,
        d.title as doc_title,
        a.alias as alias,
        a.expires_at::text as expires_at
      from public.doc_aliases a
      join public.docs d on d.id = a.doc_id
      where d.owner_id = ${u.id}::uuid
        and coalesce(a.is_active, true) = true
        and a.revoked_at is null
        and a.expires_at is not null
        and a.expires_at > now()
        and a.expires_at <= (now() + interval '3 days')
      order by a.expires_at asc
      limit 8
    `)) as unknown as Array<{ doc_id: string; doc_title: string | null; alias: string | null; expires_at: string | null }>;
    } catch {
        expiringSoon = [];
    }

    // Fast analytics read layer (doc_view_daily)

    const hasDocViewDaily = await tableExists("public.doc_view_daily");
    let topDocs7d: TopDocRow[] = [];
    let spark30: SparkRow[] = [];
    try {
        if (hasDocViewDaily) {
            topDocs7d = (await (canSeeAll
                ? sql`
        select
          d.id::text as doc_id,
          d.title as doc_title,
          a.alias as alias,
          coalesce(sum(x.view_count), 0)::int as views_7d,
          coalesce(sum(x.unique_ip_count), 0)::int as unique_ips_7d
        from public.docs d
        left join public.doc_aliases a on a.doc_id = d.id
        left join public.doc_view_daily x
          on x.doc_id = d.id
         and x.date >= (current_date - interval '6 days')
        group by d.id, d.title, a.alias
        order by views_7d desc
        limit 10
      `
                : sql`
        select
          d.id::text as doc_id,
          d.title as doc_title,
          a.alias as alias,
          coalesce(sum(x.view_count), 0)::int as views_7d,
          coalesce(sum(x.unique_ip_count), 0)::int as unique_ips_7d
        from public.docs d
        left join public.doc_aliases a on a.doc_id = d.id
        left join public.doc_view_daily x
          on x.doc_id = d.id
         and x.date >= (current_date - interval '6 days')
        where d.owner_id = ${u.id}::uuid
        group by d.id, d.title, a.alias
        order by views_7d desc
        limit 10
      `)) as unknown as TopDocRow[];

            spark30 = (await (canSeeAll
                ? sql`
        select
          x.date::text as day,
          sum(x.view_count)::int as views
        from public.doc_view_daily x
        where x.date >= (current_date - interval '29 days')
        group by x.date
        order by x.date asc
      `
                : sql`
        select
          x.date::text as day,
          sum(x.view_count)::int as views
        from public.doc_view_daily x
        join public.docs d on d.id = x.doc_id
        where d.owner_id = ${u.id}::uuid
          and x.date >= (current_date - interval '29 days')
        group by x.date
        order by x.date asc
      `)) as unknown as SparkRow[];
        }
    } catch {
        topDocs7d = [];
        spark30 = [];
    }

    // Daily aggregation summary (best-effort; table may not exist)
    let dailyAgg: DailyAggRow[] = [];
    try {
        if (hasDocViewDaily) {
            dailyAgg = (await (canSeeAll
                ? sql`
        select
          x.date::text as day,
          sum(x.view_count)::int as views,
          sum(x.unique_ip_count)::int as unique_ips
        from public.doc_view_daily x
        where x.date >= (current_date - interval '14 days')
        group by x.date
        order by x.date desc
      `
                : sql`
        select
          x.date::text as day,
          sum(x.view_count)::int as views,
          sum(x.unique_ip_count)::int as unique_ips
        from public.doc_view_daily x
        join public.docs d on d.id = x.doc_id
        where d.owner_id = ${u.id}::uuid
          and x.date >= (current_date - interval '14 days')
        group by x.date
        order by x.date desc
      `)) as unknown as DailyAggRow[];
        } else {
            dailyAgg = [];
        }
    } catch {
        dailyAgg = [];
    }

    // Retention widget (best-effort) — site-wide/admin only
    const retentionRawDays = (() => {
        const raw = (process.env.RETENTION_DAYS || "").trim();
        const n = Number(raw);
        if (!raw || !Number.isFinite(n) || n <= 0) return 90;
        return Math.floor(n);
    })();

    let retentionInfo: { oldest: string | null; scheduled: number | null } | null = null;
    let retentionSettings:
        | { ok: true; settings: { enabled: boolean; deleteExpiredShares: boolean; shareGraceDays: number } }
        | { ok: false; error: string }
        | null = null;

    if (canSeeAll) {
        retentionInfo = { oldest: null, scheduled: null };
        try {
            const hasDocViews = await tableExists("public.doc_views");
            if (hasDocViews) {
                const oldestRows = (await sql`
          select min(created_at)::text as oldest
          from public.doc_views
        `) as unknown as Array<{ oldest: string | null }>;
                const oldest = oldestRows?.[0]?.oldest ?? null;

                const scheduledRows = (await sql`
          select count(*)::int as c
          from public.doc_views
          where created_at < (now() - (${retentionRawDays}::int * interval '1 day'))
        `) as unknown as Array<{ c: number }>;
                const scheduled = scheduledRows?.[0]?.c ?? 0;

                retentionInfo = { oldest, scheduled };
            }
        } catch {
            retentionInfo = { oldest: null, scheduled: null };
        }

        // Retention toggle/settings (best-effort; requires public.app_settings)
        const hasAppSettings = await tableExists("public.app_settings");
        if (hasAppSettings) {
            retentionSettings = await getRetentionSettings();
        }
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
        has_password: Boolean((s as any).has_password),
    }));

    const viewsByDocClient: ViewsByDocRowClient[] = viewsByDoc.map((r) => ({
        doc_id: r.doc_id,
        doc_title: r.doc_title,
        alias: r.alias,
        views: Number(r.views ?? 0),
        unique_ips: Number(r.unique_ips ?? 0),
        last_view: r.last_view,
    }));

    const unifiedDocsClient: UnifiedDocRowClient[] = unifiedDocs.map((r) => ({
        doc_id: r.doc_id,
        doc_title: r.doc_title,
        alias: r.alias,
        total_views: Number(r.total_views ?? 0),
        last_view: r.last_view,
        active_shares: Number(r.active_shares ?? 0),
        alias_expires_at: r.alias_expires_at,
        alias_is_active: (r as any).alias_is_active === null || (r as any).alias_is_active === undefined ? null : Boolean((r as any).alias_is_active),
        alias_revoked_at: r.alias_revoked_at,
    }));

    // Widget metrics (best-effort)
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const expiringCount7d = sharesClient.reduce((acc, s) => {
        if (s.revoked_at) return acc;
        if (!s.expires_at) return acc;
        const exp = new Date(s.expires_at).getTime();
        if (Number.isNaN(exp)) return acc;
        if (exp > now && exp <= now + sevenDays) return acc + 1;
        return acc;
    }, 0);

    const revokedCount = sharesClient.reduce((acc, s) => (s.revoked_at ? acc + 1 : acc), 0);
    const activeCount = sharesClient.length - revokedCount;

    const top5TotalViews = viewsByDocClient.slice(0, 5).reduce((acc, r) => acc + (r.views || 0), 0);

    return (
        <main className="mx-auto max-w-6xl px-4 py-12">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
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
<Link
    href="/admin/api-keys"
    className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
>
    API keys
</Link>

<Link
    href="/admin/webhooks"
    className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
>
    Webhooks
</Link>

            </div>

            {/* ✅ UPLOAD */}
            <UploadPanel />

            {/* ANALYTICS WIDGETS */}
            <div className="mt-8">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
                        <p className="mt-1 text-sm text-neutral-400">Quick links that jump + filter tables below.</p>
                    </div>
                    <div className="text-xs text-neutral-500">Links keep filters in the URL (shareable).</div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Link
                        href="#views-by-doc"
                        className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 hover:bg-neutral-900"
                    >
                        <div className="text-xs text-neutral-400">📊 Total views per document</div>
                        <div className="mt-2 text-2xl font-semibold text-neutral-100">{viewsByDocClient.length || 0}</div>
                        <div className="mt-1 text-xs text-neutral-500">Jump to “View counts per doc”.</div>
                    </Link>

                    <Link
                        href="#top-docs"
                        className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 hover:bg-neutral-900"
                    >
                        <div className="text-xs text-neutral-400">📈 7-day rolling views</div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="text-2xl font-semibold text-neutral-100">
                                {spark30.length ? spark30.slice(-7).reduce((a, r) => a + r.views, 0) : "—"}
                            </div>
                            <Sparkline values={spark30.map((r) => r.views).slice(-14)} />
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">Jump to “Top docs”.</div>
                    </Link>

                    <Link
                        href="#top-docs"
                        className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 hover:bg-neutral-900"
                    >
                        <div className="text-xs text-neutral-400">📉 30-day views</div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="text-2xl font-semibold text-neutral-100">
                                {spark30.length ? spark30.reduce((a, r) => a + r.views, 0) : "—"}
                            </div>
                            <Sparkline values={spark30.map((r) => r.views)} />
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">Jump to “Top docs”.</div>
                    </Link>

                    <Link
                        href="/admin/dashboard?viewLimit=5#views-by-doc"
                        className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 hover:bg-neutral-900"
                    >
                        <div className="text-xs text-neutral-400">🔥 Top 5 documents by views</div>
                        <div className="mt-2 text-2xl font-semibold text-neutral-100">{top5TotalViews || 0}</div>
                        <div className="mt-1 text-xs text-neutral-500">Filters the table to “Top 5”.</div>
                    </Link>

                    <Link
                        href="/admin/dashboard?shareStatus=expiring#shares"
                        className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 hover:bg-neutral-900"
                    >
                        <div className="text-xs text-neutral-400">⏳ Expiring links (next 7 days)</div>
                        <div className="mt-2 text-2xl font-semibold text-neutral-100">{expiringCount7d}</div>
                        <div className="mt-1 text-xs text-neutral-500">Filters Shares → “Expiring (7d)”.</div>
                    </Link>

                    <Link
                        href="/admin/dashboard?shareStatus=revoked#shares"
                        className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 hover:bg-neutral-900"
                    >
                        <div className="text-xs text-neutral-400">❌ Revoked vs Active shares</div>
                        <div className="mt-2 flex items-baseline justify-between">
                            <div className="text-2xl font-semibold text-neutral-100">{revokedCount}</div>
                            <div className="text-sm text-neutral-500">revoked · {activeCount} total</div>
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">Filters Shares → “Revoked”.</div>
                    </Link>
                </div>
            </div>

            {/* UNIFIED DOCUMENTS */}
            <div id="docs" className="mt-10">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Documents</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Unified table: views + shares + alias status. Click a doc to open its detail page.
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">Default page size: 10 · Scrollable table</div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        {/*
                          Delete permissions are enforced server-side by deleteDocAction -> requireDocWrite().
                          We show the delete UI to all signed-in users:
                          - owner/admin can delete any doc
                          - viewer can delete only docs they own
                        */}
                        <UnifiedDocsTableClient rows={unifiedDocsClient} defaultPageSize={10} showDelete={true} />
                    </div>

                    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-200">Expiration warnings</h3>
                                <p className="mt-1 text-xs text-neutral-500">Aliases expiring within 3 days.</p>
                            </div>
                            <form action={sendExpirationAlertAction}>
                                <input type="hidden" name="days" value="3" />
                                <button
                                    type="submit"
                                    className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700"
                                    title="Email an expiration summary to the owner"
                                >
                                    Email owner
                                </button>
                            </form>
                        </div>

                        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                            <div className="text-2xl font-semibold text-neutral-100">{expiringSoon.length}</div>
                            <div className="text-xs text-neutral-500">docs expiring soon</div>
                        </div>

                        <div className="mt-4 space-y-3">
                            {expiringSoon.length === 0 ? (
                                <div className="text-sm text-neutral-500">No aliases expiring soon.</div>
                            ) : (
                                expiringSoon.map((r) => (
                                    <div key={r.doc_id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                                        <Link href={`/admin/docs/${r.doc_id}`} className="text-sm text-neutral-200 hover:underline">
                                            {r.doc_title || "Untitled"}
                                        </Link>
                                        <div className="mt-1 text-xs text-neutral-500">Expires: {fmtDate(r.expires_at)}</div>
                                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                            {r.alias ? (
                                                <Link href={`/d/${r.alias}`} target="_blank" className="text-blue-400 hover:underline">
                                                    /d/{r.alias}
                                                </Link>
                                            ) : null}
                                            <span className="text-neutral-600 font-mono">{r.doc_id}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-4 text-xs text-neutral-500">
                            Need to delete a doc? Use the legacy list on <Link href="/admin" className="text-blue-400 hover:underline">/admin</Link>.
                        </div>
                    </div>
                </div>
            </div>

            {/* SHARES */}
            <div id="shares" className="mt-10">
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

                <SharesTableClient shares={sharesClient} />
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

            {/* TOP DOCS + 30-DAY SPARKLINE */}
            <div id="top-docs" className="mt-12">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Top docs</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Uses <span className="font-mono">doc_view_daily</span> (7-day leaderboard + 30-day trend).
                        </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                        <div className="flex items-center gap-2">
                            <span className="text-neutral-400">30-day views</span>
                            <Sparkline values={spark30.map((r) => r.views)} />
                        </div>
                        <Link
                            className="text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
                            href="/api/admin/analytics/aggregate"
                            target="_blank"
                        >
                            Run aggregate
                        </Link>
                    </div>
                </div>

                {!hasDocViewDaily ? (
                    <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
                        <div className="font-semibold">Missing table: public.doc_view_daily</div>
                        <div className="mt-1 text-neutral-400">
                            Create it with <span className="font-mono">scripts/sql/doc_view_daily.sql</span>, then run the
                            aggregate.
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
                        <div className="max-h-[420px] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Doc</th>
                                        <th className="px-4 py-3 text-left">Alias</th>
                                        <th className="px-4 py-3 text-right">Views (7d)</th>
                                        <th className="px-4 py-3 text-right">Unique IPs (7d)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topDocs7d.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-6 text-neutral-400">
                                                No aggregated view data yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        topDocs7d.map((r) => (
                                            <tr key={r.doc_id} className="border-t border-neutral-800">
                                                <td className="px-4 py-3">
                                                    <div className="text-neutral-200">{r.doc_title || "Untitled"}</div>
                                                    <div className="text-xs text-neutral-500 font-mono">{r.doc_id}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {r.alias ? (
                                                        <Link
                                                            href={`/d/${r.alias}`}
                                                            target="_blank"
                                                            className="text-blue-400 hover:underline"
                                                        >
                                                            /d/{r.alias}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-neutral-500">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right text-neutral-200">{r.views_7d}</td>
                                                <td className="px-4 py-3 text-right text-neutral-200">{r.unique_ips_7d}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* VIEW COUNTS */}
            <div id="views-by-doc" className="mt-12">
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

                {viewsByDocClient.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
                        No view data found (or table not available).
                    </div>
                ) : (
                    <ViewsByDocTableClient rows={viewsByDocClient} />
                )}
            </div>

            {/* DAILY ANALYTICS */}
            <div className="mt-12">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Daily analytics (last 14 days)</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Reads from <span className="font-mono">doc_view_daily</span>.{" "}
                            {canSeeAll ? (
                                <>
                                    Generate/refresh via{" "}
                                    <Link className="text-blue-400 hover:underline" href="/api/admin/analytics/aggregate" target="_blank">
                                        /api/admin/analytics/aggregate
                                    </Link>
                                    .
                                </>
                            ) : (
                                <>Auto-refreshed nightly.</>
                            )}
                        </p>
                        <div className="mt-2 text-xs text-neutral-500">
                            {canSeeAll ? (
                                <>
                                    Retention: {retentionRawDays} days · Oldest retained: {fmtDate(retentionInfo?.oldest ?? null)} · Rows scheduled for deletion: {retentionInfo?.scheduled ?? "—"}
                                </>
                            ) : (
                                <>Retention controls are available to the site owner.</>
                            )}
                        </div>

                        {canSeeAll ? (
                            retentionSettings ? (
                                retentionSettings.ok ? (
                                    <form action={updateRetentionSettingsAction} className="mt-3 flex flex-wrap items-end gap-3 text-xs">
                                        <label className="flex items-center gap-2 text-neutral-300">
                                            <input
                                                type="checkbox"
                                                name="retention_enabled"
                                                defaultChecked={retentionSettings.settings.enabled}
                                                className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-neutral-200"
                                            />
                                            <span>Retention enabled</span>
                                        </label>

                                        <label className="flex items-center gap-2 text-neutral-300">
                                            <input
                                                type="checkbox"
                                                name="retention_delete_expired_shares"
                                                defaultChecked={retentionSettings.settings.deleteExpiredShares}
                                                className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-neutral-200"
                                            />
                                            <span>Auto-delete expired shares</span>
                                        </label>

                                        <label className="flex items-center gap-2 text-neutral-300">
                                            <span>Grace days</span>
                                            <input
                                                type="number"
                                                name="retention_share_grace_days"
                                                min={0}
                                                defaultValue={retentionSettings.settings.shareGraceDays}
                                                className="w-20 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-100"
                                            />
                                        </label>

                                        <button type="submit" className="rounded-md bg-neutral-800 px-3 py-1.5 text-neutral-100 hover:bg-neutral-700">
                                            Save
                                        </button>

                                        <div className="text-neutral-500">
                                            Stored in <span className="font-mono">app_settings</span> (key: <span className="font-mono">retention</span>).
                                        </div>
                                    </form>
                                ) : (
                                    <div className="mt-3 text-xs text-neutral-500">
                                        Retention toggle unavailable (settings read error). You can still control retention via env vars.
                                    </div>
                                )
                            ) : (
                                <div className="mt-3 text-xs text-neutral-500">
                                    Optional admin toggle not installed. Run <span className="font-mono">scripts/sql/app_settings.sql</span> to enable.
                                </div>
                            )
                        ) : null}
                    </div>
                    <div className="text-xs text-neutral-500">
                        {canSeeAll ? (
                            <Link className="text-neutral-400 hover:text-neutral-200 underline underline-offset-4" href="/api/admin/retention/run" target="_blank">
                                Run retention
                            </Link>
                        ) : null}
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
                                        <tr key={r.day} className="border-t border-neutral-800">
                                            <td className="px-4 py-3 text-neutral-200 font-mono text-xs">{r.day}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{r.views}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{r.unique_ips}</td>
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
}
