// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { isOwnerAdmin } from "@/lib/admin";
import DeleteDocForm from "../DeleteDocForm";
import {
    deleteDocAction,
    revokeDocShareAction,
    setSharePasswordAction,
    clearSharePasswordAction,
} from "../actions";
import SharesTableClient, { type ShareRow as ShareRowClient } from "./SharesTableClient";
import UploadPanel from "./UploadPanel";

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
    const ok = await isOwnerAdmin();
    if (!ok) redirect("/api/auth/signin");

    const docs = (await sql`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      a.alias
    from docs d
    left join doc_aliases a on a.doc_id = d.id
    order by d.created_at desc
  `) as unknown as DocRow[];

    const shares = (await sql`
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
  `) as unknown as ShareRow[];

    const hasDocAccessLog = await tableExists("public.doc_access_log");
    const hasDocAudit = await tableExists("public.doc_audit");

    // Recent access logs (best-effort; table may not exist in older envs)
    let access: AccessRow[] = [];
    try {
        if (hasDocAccessLog) {
            access = (await sql`
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
      `) as unknown as AccessRow[];
        } else if (hasDocAudit) {
            // logDocAccess() writes to doc_audit by default in this repo.
            access = (await sql`
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
      `) as unknown as AccessRow[];
        } else {
            access = [];
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
            ? ((await sql`
        select
          count(*)::int as total,
          count(distinct coalesce(device_hash, ''))::int as uniques,
          max(accessed_at)::text as last
        from public.doc_access_log
      `) as unknown as Array<{ total: number; uniques: number; last: string | null }> )
            : hasDocAudit
              ? ((await sql`
        select
          count(*)::int as total,
          0::int as uniques,
          max(created_at)::text as last
        from public.doc_audit
      `) as unknown as Array<{ total: number; uniques: number; last: string | null }> )
              : ([] as Array<{ total: number; uniques: number; last: string | null }>);
        if (rows?.[0]) accessSummary = rows[0];
    } catch {
        // ignore
    }

    // View count per doc (best-effort; doc_views may not exist)
    let viewsByDoc: ViewsByDocRow[] = [];
    try {
        viewsByDoc = (await sql`
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
    `) as unknown as ViewsByDocRow[];
    } catch {
        viewsByDoc = [];
    }

    // Fast analytics read layer (doc_view_daily)
    const hasDocViewDaily = await tableExists("public.doc_view_daily");
    let topDocs7d: TopDocRow[] = [];
    let spark30: SparkRow[] = [];
    try {
        if (hasDocViewDaily) {
            topDocs7d = (await sql`
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
      `) as unknown as TopDocRow[];

            spark30 = (await sql`
        select
          x.date::text as day,
          sum(x.view_count)::int as views
        from public.doc_view_daily x
        where x.date >= (current_date - interval '29 days')
        group by x.date
        order by x.date asc
      `) as unknown as SparkRow[];
        }
    } catch {
        topDocs7d = [];
        spark30 = [];
    }

    // Daily aggregation summary (best-effort; table may not exist)
    let dailyAgg: DailyAggRow[] = [];
    try {
        if (hasDocViewDaily) {
            dailyAgg = (await sql`
        select
          x.date::text as day,
          sum(x.view_count)::int as views,
          sum(x.unique_ip_count)::int as unique_ips
        from public.doc_view_daily x
        where x.date >= (current_date - interval '14 days')
        group by x.date
        order by x.date desc
      `) as unknown as DailyAggRow[];
        } else {
            dailyAgg = [];
        }
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
        has_password: Boolean((s as any).has_password),
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

            {/* TOP DOCS + 30-DAY SPARKLINE */}
            <div className="mt-12">
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
