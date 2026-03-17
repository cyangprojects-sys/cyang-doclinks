import { sql } from "@/lib/db";
import { getPlanForUser } from "@/lib/monetization";
import { roleAtLeast, type AuthedUser } from "@/lib/authz";
import { type ShareRow } from "./SharesTableClient";
import { type UnifiedDocRow } from "./UnifiedDocsTableClient";
import { type ViewsByDocRow } from "./ViewsByDocTableClient";

export type HeaderDoc = {
  docId: string;
  title: string;
  docState?: string | null;
  scanState?: string | null;
  moderationStatus?: string | null;
};

export type RecentDocRow = {
  doc_id: string;
  doc_title: string | null;
  doc_state: string | null;
  scan_status: string | null;
  moderation_status: string | null;
  created_at: string | null;
};

type DashboardCtx = {
  canSeeAll: boolean;
  canCheckEncryptionStatus: boolean;
  planId: "free" | "pro";
  nowTs: number;
  hasDocs: boolean;
  hasDocViews: boolean;
  hasShareTokens: boolean;
  hasDocAliases: boolean;
  hasOwnerId: boolean;
  hasOrgId: boolean;
  hasCreatedByEmail: boolean;
  docFilter: ReturnType<typeof sql>;
};

export type DashboardHomeData = Awaited<ReturnType<typeof getDashboardHomeData>>;
export type DashboardDocumentsData = Awaited<ReturnType<typeof getDashboardDocumentsData>>;
export type DashboardLinksData = Awaited<ReturnType<typeof getDashboardLinksData>>;
export type DashboardActivityData = Awaited<ReturnType<typeof getDashboardActivityData>>;
export type DashboardOverviewData = {
  homeData: DashboardHomeData;
  docsData: DashboardDocumentsData;
  linksData: DashboardLinksData;
  activityData: DashboardActivityData;
  snapshotGeneratedAt: number;
};

export type DashboardActivityPageData = {
  homeData: DashboardHomeData;
  activityData: DashboardActivityData;
  snapshotGeneratedAt: number;
};

type DashboardSchemaState = Omit<
  DashboardCtx,
  "canSeeAll" | "canCheckEncryptionStatus" | "planId" | "nowTs" | "docFilter"
>;

type DashboardSchemaCacheEntry = {
  expiresAt: number;
  value: DashboardSchemaState;
};

type DashboardCtxCacheEntry = {
  expiresAt: number;
  value: DashboardCtx;
};

type DashboardOverviewCacheEntry = {
  expiresAt: number;
  value: DashboardOverviewData;
};

type DashboardActivityPageCacheEntry = {
  expiresAt: number;
  value: DashboardActivityPageData;
};

let dashboardSchemaCache: DashboardSchemaCacheEntry | null = null;
let dashboardSchemaInFlight: Promise<DashboardSchemaState> | null = null;
const dashboardCtxCache = new Map<string, DashboardCtxCacheEntry>();
const dashboardCtxInFlight = new Map<string, Promise<DashboardCtx>>();
const dashboardOverviewCache = new Map<string, DashboardOverviewCacheEntry>();
const dashboardOverviewInFlight = new Map<string, Promise<DashboardOverviewData>>();
const dashboardActivityPageCache = new Map<string, DashboardActivityPageCacheEntry>();
const dashboardActivityPageInFlight = new Map<string, Promise<DashboardActivityPageData>>();

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

function getDashboardSchemaCacheMs(): number {
  const raw = Number(process.env.DASHBOARD_SCHEMA_CACHE_MS || 60_000);
  if (!Number.isFinite(raw)) return 60_000;
  return Math.max(5_000, Math.min(10 * 60_000, Math.floor(raw)));
}

function getDashboardOverviewCacheMs(): number {
  const raw = Number(process.env.DASHBOARD_OVERVIEW_CACHE_MS || 30_000);
  if (!Number.isFinite(raw)) return 30_000;
  return Math.max(5_000, Math.min(2 * 60_000, Math.floor(raw)));
}

function getDashboardCtxCacheKey(u: AuthedUser): string {
  return [u.id, u.email, u.role, u.orgId ?? "", u.orgSlug ?? ""].join("|");
}

function setDashboardCtxCache(key: string, value: DashboardCtx) {
  dashboardCtxCache.set(key, {
    value,
    expiresAt: Date.now() + getDashboardOverviewCacheMs(),
  });
  if (dashboardCtxCache.size > 200) {
    const oldestKey = dashboardCtxCache.keys().next().value;
    if (oldestKey) dashboardCtxCache.delete(oldestKey);
  }
}

function setDashboardOverviewCache(key: string, value: DashboardOverviewData) {
  dashboardOverviewCache.set(key, {
    value,
    expiresAt: Date.now() + getDashboardOverviewCacheMs(),
  });
  if (dashboardOverviewCache.size > 100) {
    const oldestKey = dashboardOverviewCache.keys().next().value;
    if (oldestKey) dashboardOverviewCache.delete(oldestKey);
  }
}

function setDashboardActivityPageCache(key: string, value: DashboardActivityPageData) {
  dashboardActivityPageCache.set(key, {
    value,
    expiresAt: Date.now() + getDashboardOverviewCacheMs(),
  });
  if (dashboardActivityPageCache.size > 100) {
    const oldestKey = dashboardActivityPageCache.keys().next().value;
    if (oldestKey) dashboardActivityPageCache.delete(oldestKey);
  }
}

async function getDashboardSchemaState(): Promise<DashboardSchemaState> {
  const now = Date.now();
  if (dashboardSchemaCache && dashboardSchemaCache.expiresAt > now) {
    return dashboardSchemaCache.value;
  }

  if (!dashboardSchemaInFlight) {
    dashboardSchemaInFlight = (async (): Promise<DashboardSchemaState> => {
      const [
        hasDocs,
        hasDocViews,
        hasShareTokens,
        hasDocAliases,
        hasOwnerId,
        hasOrgId,
        hasCreatedByEmail,
      ] = await Promise.all([
        tableExists("public.docs"),
        tableExists("public.doc_views"),
        tableExists("public.share_tokens"),
        tableExists("public.doc_aliases"),
        columnExists("docs", "owner_id"),
        columnExists("docs", "org_id"),
        columnExists("docs", "created_by_email"),
      ]);

      const value: DashboardSchemaState = {
        hasDocs,
        hasDocViews,
        hasShareTokens,
        hasDocAliases,
        hasOwnerId,
        hasOrgId,
        hasCreatedByEmail,
      };
      dashboardSchemaCache = {
        value,
        expiresAt: Date.now() + getDashboardSchemaCacheMs(),
      };
      return value;
    })().finally(() => {
      dashboardSchemaInFlight = null;
    });
  }

  return dashboardSchemaInFlight;
}

async function getCtx(u: AuthedUser): Promise<DashboardCtx> {
  const cacheKey = getDashboardCtxCacheKey(u);
  const cached = dashboardCtxCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = dashboardCtxInFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const loadPromise = (async (): Promise<DashboardCtx> => {
    const canSeeAll = roleAtLeast(u.role, "admin");
    const canCheckEncryptionStatus = roleAtLeast(u.role, "owner");
    const [userPlan, schema] = await Promise.all([getPlanForUser(u.id), getDashboardSchemaState()]);
    const planId = String(userPlan.id || "free").toLowerCase() === "pro" ? "pro" : "free";
    const nowTs = Date.now();

    const orgFilter = schema.hasOrgId && u.orgId ? sql`and d.org_id = ${u.orgId}::uuid` : sql``;
    const ownerFilter = !canSeeAll
      ? schema.hasOwnerId
        ? schema.hasCreatedByEmail
          ? sql`and (d.owner_id = ${u.id}::uuid or (d.owner_id is null and lower(coalesce(d.created_by_email,'')) = lower(${u.email})))`
          : sql`and d.owner_id = ${u.id}::uuid`
        : schema.hasCreatedByEmail
          ? sql`and lower(coalesce(d.created_by_email,'')) = lower(${u.email})`
          : sql``
      : sql``;
    const docFilter = sql`${orgFilter} ${ownerFilter}`;

    const value: DashboardCtx = {
      canSeeAll,
      canCheckEncryptionStatus,
      planId,
      nowTs,
      ...schema,
      docFilter,
    };
    setDashboardCtxCache(cacheKey, value);
    return value;
  })().finally(() => {
    dashboardCtxInFlight.delete(cacheKey);
  });

  dashboardCtxInFlight.set(cacheKey, loadPromise);
  return loadPromise;
}

export async function getDashboardHomeData(u: AuthedUser) {
  const ctx = await getCtx(u);

  let headerDocs: HeaderDoc[] = [];
  let recentDocs: RecentDocRow[] = [];

  if (ctx.hasDocs) {
    try {
      headerDocs = (await sql`
        select
          d.id::text as "docId",
          coalesce(d.title::text, 'Untitled document') as title,
          coalesce(d.status::text, 'ready') as "docState",
          coalesce(d.scan_status::text, 'unscanned') as "scanState",
          coalesce(d.moderation_status::text, 'active') as "moderationStatus"
        from public.docs d
        where 1=1
          and lower(coalesce(d.status::text, 'ready')) <> 'deleted'
          ${ctx.docFilter}
        order by d.created_at desc
        limit 2000
      `) as unknown as HeaderDoc[];
    } catch {
      headerDocs = [];
    }

    try {
      recentDocs = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as doc_title,
          coalesce(d.status::text, 'ready') as doc_state,
          coalesce(d.scan_status::text, 'unscanned') as scan_status,
          coalesce(d.moderation_status::text, 'active') as moderation_status,
          d.created_at::text as created_at
        from public.docs d
        where 1=1
          and lower(coalesce(d.status::text, 'ready')) <> 'deleted'
          ${ctx.docFilter}
        order by d.created_at desc
        limit 5
      `) as unknown as RecentDocRow[];
    } catch {
      recentDocs = [];
    }
  }

  return {
    ...ctx,
    headerDocs,
    recentDocs,
    missingCoreTables: !ctx.hasDocs || (!ctx.hasDocViews && !ctx.hasShareTokens),
  };
}

export async function getDashboardDocumentsData(u: AuthedUser) {
  const ctx = await getCtx(u);
  let unifiedRows: UnifiedDocRow[] = [];

  if (ctx.hasDocs) {
    try {
      const aliasJoin = ctx.hasDocAliases
        ? sql`
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
          `
        : sql`
            left join lateral (
              select
                null::text as alias,
                null::timestamptz as expires_at,
                null::boolean as is_active,
                null::timestamptz as revoked_at
            ) a on true
          `;
      const viewsJoin = ctx.hasDocViews
        ? sql`
            left join lateral (
              select
                count(*)::int as total_views,
                max(vv.created_at) as last_view
              from public.doc_views vv
              where vv.doc_id = d.id
            ) v on true
          `
        : sql`
            left join lateral (
              select
                0::int as total_views,
                null::timestamptz as last_view
            ) v on true
          `;
      const shareCountJoin = ctx.hasShareTokens
        ? sql`
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
          `
        : sql`
            left join lateral (
              select 0::int as active_shares
            ) s on true
          `;
      const latestShareJoin = ctx.hasShareTokens
        ? sql`
            left join lateral (
              select
                st.token,
                st.created_at
              from public.share_tokens st
              where st.doc_id = d.id
                and st.revoked_at is null
                and (st.expires_at is null or st.expires_at > now())
                and (
                  st.max_views is null
                  or st.max_views = 0
                  or coalesce(st.views_count, 0) < st.max_views
                )
              order by st.created_at desc nulls last
              limit 1
            ) ls on true
          `
        : sql`
            left join lateral (
              select
                null::text as token,
                null::timestamptz as created_at
            ) ls on true
          `;

      unifiedRows = (await sql`
        select
          d.id::text as doc_id,
          d.title::text as doc_title,
          coalesce(d.status::text, 'ready') as doc_state,
          d.created_at::text as created_at,
          a.alias::text as alias,
          coalesce(d.scan_status::text, 'unscanned') as scan_status,
          coalesce(d.moderation_status::text, 'active') as moderation_status,
          coalesce(v.total_views, 0)::int as total_views,
          v.last_view::text as last_view,
          coalesce(s.active_shares, 0)::int as active_shares,
          ls.token::text as latest_share_token,
          ls.created_at::text as latest_share_created_at,
          a.expires_at::text as alias_expires_at,
          a.is_active as alias_is_active,
          a.revoked_at::text as alias_revoked_at
        from public.docs d
        ${aliasJoin}
        ${viewsJoin}
        ${shareCountJoin}
        ${latestShareJoin}
        where 1=1
          and lower(coalesce(d.status::text, 'ready')) <> 'deleted'
          ${ctx.docFilter}
        order by d.created_at desc
      `) as unknown as UnifiedDocRow[];
    } catch {
      unifiedRows = [];
    }
  }

  return {
    ...ctx,
    unifiedRows,
    showDelete: ctx.canSeeAll || ctx.hasOwnerId || ctx.hasCreatedByEmail,
    missingCoreTables: !ctx.hasDocs,
  };
}

export async function getDashboardLinksData(u: AuthedUser) {
  const ctx = await getCtx(u);
  let shares: ShareRow[] = [];

  if (ctx.hasShareTokens && ctx.hasDocs) {
    try {
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
          and st.revoked_at is null
          and (st.expires_at is null or st.expires_at > now())
          ${ctx.docFilter}
        order by st.created_at desc
        limit 2000
      `) as unknown as ShareRow[];
    } catch {
      shares = [];
    }
  }

  return {
    ...ctx,
    shares,
    missingCoreTables: !ctx.hasShareTokens || !ctx.hasDocs,
  };
}

export async function getDashboardActivityData(u: AuthedUser) {
  const ctx = await getCtx(u);
  let viewsRows: ViewsByDocRow[] = [];

  if (ctx.hasDocs && ctx.hasDocViews) {
    try {
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
          ${ctx.docFilter}
        group by d.id, d.title, a.alias
        order by views desc, last_view desc nulls last
      `) as unknown as ViewsByDocRow[];
    } catch {
      viewsRows = [];
    }
  }

  return {
    ...ctx,
    viewsRows,
    missingCoreTables: !ctx.hasDocs || !ctx.hasDocViews,
  };
}

export async function getDashboardOverviewData(u: AuthedUser): Promise<DashboardOverviewData> {
  const cacheKey = getDashboardCtxCacheKey(u);
  const cached = dashboardOverviewCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = dashboardOverviewInFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const loadPromise = (async (): Promise<DashboardOverviewData> => {
    const [homeData, docsData, linksData, activityData] = await Promise.all([
      getDashboardHomeData(u),
      getDashboardDocumentsData(u),
      getDashboardLinksData(u),
      getDashboardActivityData(u),
    ]);

    const value: DashboardOverviewData = {
      homeData,
      docsData,
      linksData,
      activityData,
      snapshotGeneratedAt: Date.now(),
    };
    setDashboardOverviewCache(cacheKey, value);
    return value;
  })().finally(() => {
    dashboardOverviewInFlight.delete(cacheKey);
  });

  dashboardOverviewInFlight.set(cacheKey, loadPromise);
  return loadPromise;
}

export async function getDashboardActivityPageData(u: AuthedUser): Promise<DashboardActivityPageData> {
  const cacheKey = getDashboardCtxCacheKey(u);
  const cached = dashboardActivityPageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = dashboardActivityPageInFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const loadPromise = (async (): Promise<DashboardActivityPageData> => {
    const [homeData, activityData] = await Promise.all([
      getDashboardHomeData(u),
      getDashboardActivityData(u),
    ]);

    const value: DashboardActivityPageData = {
      homeData,
      activityData,
      snapshotGeneratedAt: Date.now(),
    };
    setDashboardActivityPageCache(cacheKey, value);
    return value;
  })().finally(() => {
    dashboardActivityPageInFlight.delete(cacheKey);
  });

  dashboardActivityPageInFlight.set(cacheKey, loadPromise);
  return loadPromise;
}
