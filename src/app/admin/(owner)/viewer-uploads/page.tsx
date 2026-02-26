import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import ViewerUploadsTableClient, { type ViewerUploadRow } from "./ViewerUploadsTableClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export default async function ViewerUploadsPage() {
  const u = await requireRole("owner");

  const hasDocs = await tableExists("public.docs");
  if (!hasDocs) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Viewer Upload Moderation</h1>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          `public.docs` table is missing.
        </div>
      </main>
    );
  }

  const hasUsers = await tableExists("public.users");
  const hasDocAliases = await tableExists("public.doc_aliases");
  const hasShareTokens = await tableExists("public.share_tokens");
  const hasDocViews = await tableExists("public.doc_views");
  const hasOrgId = await columnExists("docs", "org_id");
  const hasCreatedByEmail = await columnExists("docs", "created_by_email");
  const orgGate = hasOrgId && u.orgId ? sql`and d.org_id = ${u.orgId}::uuid` : sql``;

  const rows = (await sql`
    select
      d.id::text as doc_id,
      d.title::text as title,
      coalesce(usr.email, ${hasCreatedByEmail ? sql`d.created_by_email` : sql`null::text`})::text as uploader_email,
      coalesce(usr.role::text, 'viewer')::text as uploader_role,
      d.created_at::text as created_at,
      d.size_bytes::bigint as size_bytes,
      coalesce(d.moderation_status::text, 'active') as moderation_status,
      coalesce(d.scan_status::text, 'unscanned') as scan_status,
      coalesce(d.risk_level::text, 'low') as risk_level,
      ${hasDocAliases
        ? sql`(
            select da.alias::text
            from public.doc_aliases da
            where da.doc_id = d.id
            order by da.created_at desc nulls last
            limit 1
          )`
        : sql`null::text`} as alias,
      ${hasShareTokens
        ? sql`(
            select count(*)::int
            from public.share_tokens st
            where st.doc_id = d.id
              and st.revoked_at is null
              and (st.expires_at is null or st.expires_at > now())
              and (st.max_views is null or st.max_views = 0 or coalesce(st.views_count, 0) < st.max_views)
          )`
        : sql`0::int`} as active_shares,
      ${hasDocViews
        ? sql`(
            select count(*)::int
            from public.doc_views dv
            where dv.doc_id = d.id
          )`
        : sql`0::int`} as total_views
    from public.docs d
    ${hasUsers ? sql`left join public.users usr on usr.id = d.owner_id` : sql`left join (select null::uuid as id, null::text as email, null::text as role) usr on true`}
    where 1=1
      ${orgGate}
      and (
        lower(coalesce(usr.role::text, 'viewer')) = 'viewer'
        or (usr.id is null and d.owner_id is null and ${hasCreatedByEmail ? sql`d.created_by_email is not null` : sql`false`})
      )
    order by d.created_at desc
    limit 5000
  `) as unknown as ViewerUploadRow[];

  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Viewer Upload Moderation</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Owner-only review queue for documents uploaded by viewer accounts. Use filters, isolate risk states, and run removal actions with reason logging.
        </p>
      </div>
      <ViewerUploadsTableClient rows={rows} />
    </main>
  );
}
