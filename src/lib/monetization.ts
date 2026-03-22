import { sql } from "@/lib/db";
import { readEnvBoolean, readEnvInt } from "@/lib/envConfig";
import { getBillingFlags } from "@/lib/settings";
import { hasActiveViewLimitOverride } from "@/lib/viewLimitOverride";
import { rateLimit } from "@/lib/rateLimit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Plan = {
  id: "free" | "pro" | (string & {});
  name: string;
  maxViewsPerMonth: number | null;
  maxActiveShares: number | null;
  maxStorageBytes: number | null;
  maxUploadsPerDay: number | null;
  maxFileSizeBytes: number | null;
  allowCustomExpiration: boolean;
  allowAuditExport: boolean;
  allowAdvancedAnalytics: boolean;
};

export const FREE_PLAN: Plan = {
  id: "free",
  name: "Free",
  maxViewsPerMonth: 100,
  maxActiveShares: 3,
  maxStorageBytes: 104857600, // 100 MB
  maxUploadsPerDay: 10,
  maxFileSizeBytes: 26214400, // 25 MB
  allowCustomExpiration: false,
  allowAuditExport: false,
  allowAdvancedAnalytics: false,
};

export const PRO_PLAN: Plan = {
  id: "pro",
  name: "Pro",
  maxViewsPerMonth: null, // soft monitored
  maxActiveShares: null,
  maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
  maxUploadsPerDay: null,
  maxFileSizeBytes: 104857600, // 100 MB
  allowCustomExpiration: true,
  allowAuditExport: true,
  allowAdvancedAnalytics: true,
};

const OWNER_UNLIMITED_PLAN: Plan = {
  id: "owner",
  name: "Owner",
  maxViewsPerMonth: null,
  maxActiveShares: null,
  maxStorageBytes: null,
  maxUploadsPerDay: null,
  maxFileSizeBytes: null,
  allowCustomExpiration: true,
  allowAuditExport: true,
  allowAdvancedAnalytics: true,
};

let billingSubscriptionsTableExistsCache: boolean | null = null;
type PlanCacheEntry = {
  expiresAt: number;
  value: Plan;
};

const planCache = new Map<string, PlanCacheEntry>();
const planInFlight = new Map<string, Promise<Plan>>();

function normalizeUuid(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return UUID_RE.test(normalized) ? normalized : null;
}

function getPlanCacheMs(): number {
  return readEnvInt("PLAN_CACHE_MS", 10_000, { min: 1_000, max: 60_000 });
}

async function billingSubscriptionsTableExists(): Promise<boolean> {
  if (billingSubscriptionsTableExistsCache != null) return billingSubscriptionsTableExistsCache;
  try {
    const rows = (await sql`select to_regclass('public.billing_subscriptions')::text as reg`) as unknown as Array<{ reg: string | null }>;
    billingSubscriptionsTableExistsCache = Boolean(rows?.[0]?.reg);
  } catch {
    billingSubscriptionsTableExistsCache = false;
  }
  return billingSubscriptionsTableExistsCache;
}

async function userHasActiveProEntitlement(userId: string): Promise<boolean> {
  const uid = normalizeUuid(userId);
  if (!uid) return false;
  if (!(await billingSubscriptionsTableExists())) return false;
  const allowTrialing = readEnvBoolean("STRIPE_ALLOW_TRIALING_ENTITLEMENT", false);
  const allowGrace = readEnvBoolean("STRIPE_ALLOW_GRACE_ENTITLEMENT", false);
  try {
    const rows = (await sql`
      select 1
      from public.billing_subscriptions bs
      where bs.user_id = ${uid}::uuid
        and bs.plan_id = 'pro'
        and (
          lower(coalesce(bs.status, '')) = 'active'
          ${allowTrialing ? sql`or lower(coalesce(bs.status, '')) = 'trialing'` : sql``}
          ${
            allowGrace
              ? sql`or (
            lower(coalesce(bs.status, '')) in ('past_due', 'grace')
            and bs.grace_until is not null
            and bs.grace_until > now()
          )`
              : sql``
          }
        )
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getPlanForUser(userId: string): Promise<Plan> {
  const uid = normalizeUuid(userId);
  if (!uid) return FREE_PLAN;
  const now = Date.now();
  const cached = planCache.get(uid);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const existing = planInFlight.get(uid);
  if (existing) {
    return existing;
  }

  const pending = (async (): Promise<Plan> => {
  const billingRes = await getBillingFlags();
  const billing = billingRes.flags;

  let rows: Array<{
    role: string | null;
    id: string | null;
    name: string | null;
    max_views_per_month: number | null;
    max_active_shares: number | null;
    max_storage_bytes: number | string | null;
    max_uploads_per_day: number | null;
    max_file_size_bytes: number | string | null;
    allow_custom_expiration: boolean | null;
    allow_audit_export: boolean | null;
  }> = [];
  try {
    rows = (await sql`
      select
        u.role::text as role,
        p.id::text as id,
        p.name::text as name,
        p.max_views_per_month::int as max_views_per_month,
        p.max_active_shares::int as max_active_shares,
        p.max_storage_bytes::bigint as max_storage_bytes,
        p.max_uploads_per_day::int as max_uploads_per_day,
        p.max_file_size_bytes::bigint as max_file_size_bytes,
        p.allow_custom_expiration::bool as allow_custom_expiration,
        p.allow_audit_export::bool as allow_audit_export
      from public.users u
      join public.plans p on p.id = u.plan_id
      where u.id = ${uid}::uuid
      limit 1
    `) as unknown as typeof rows;
  } catch {
    const fallback = FREE_PLAN;
    planCache.set(uid, {
      value: fallback,
      expiresAt: Date.now() + getPlanCacheMs(),
    });
    return fallback;
  }

  const r = rows?.[0];
  if (!r) {
    // Fail closed to Free if user row exists but plan missing.
    const fallback = FREE_PLAN;
    planCache.set(uid, {
      value: fallback,
      expiresAt: Date.now() + getPlanCacheMs(),
    });
    return fallback;
  }

  // Product invariant: owner accounts are never constrained by plan limits.
  if (String(r.role || "").toLowerCase() === "owner") {
    planCache.set(uid, {
      value: OWNER_UNLIMITED_PLAN,
      expiresAt: Date.now() + getPlanCacheMs(),
    });
    return OWNER_UNLIMITED_PLAN;
  }

  // Free policy is a product invariant; enforce canonical values even if DB row is stale.
  if (String(r.id) === "free") {
    planCache.set(uid, {
      value: FREE_PLAN,
      expiresAt: Date.now() + getPlanCacheMs(),
    });
    return FREE_PLAN;
  }

  // Hidden pricing flag: "pro" is present but does not grant unlimited behavior until enabled.
  if (String(r.id) === "pro" && !billing.proPlanEnabled) {
    planCache.set(uid, {
      value: FREE_PLAN,
      expiresAt: Date.now() + getPlanCacheMs(),
    });
    return FREE_PLAN;
  }

  // Optional Stripe entitlement hardening:
  // when enabled, users marked "pro" without active paid entitlement are treated as Free.
  if (String(r.id) === "pro") {
    const enforceStripeEntitlement = readEnvBoolean("STRIPE_ENFORCE_ENTITLEMENT", true);
    if (enforceStripeEntitlement) {
      const entitled = await userHasActiveProEntitlement(uid);
      if (!entitled) {
        planCache.set(uid, {
          value: FREE_PLAN,
          expiresAt: Date.now() + getPlanCacheMs(),
        });
        return FREE_PLAN;
      }
    }
    // Pro policy invariant: enforce canonical product limits/features.
    planCache.set(uid, {
      value: PRO_PLAN,
      expiresAt: Date.now() + getPlanCacheMs(),
    });
    return PRO_PLAN;
  }

  const normalizedId = String(r.id || "free") as Plan["id"];
  const computedPlan: Plan = {
    id: normalizedId,
    name: String(r.name || "Free"),
    maxViewsPerMonth: r.max_views_per_month ?? null,
    maxActiveShares: r.max_active_shares ?? null,
    maxStorageBytes: r.max_storage_bytes == null ? null : Number(r.max_storage_bytes),
    maxUploadsPerDay: r.max_uploads_per_day ?? null,
    maxFileSizeBytes: r.max_file_size_bytes == null ? null : Number(r.max_file_size_bytes),
    allowCustomExpiration: Boolean(r.allow_custom_expiration),
    allowAuditExport: Boolean(r.allow_audit_export),
    allowAdvancedAnalytics: normalizedId !== "free",
  };
  planCache.set(uid, {
    value: computedPlan,
    expiresAt: Date.now() + getPlanCacheMs(),
  });
  return computedPlan;
  })();

  planInFlight.set(
    uid,
    pending.finally(() => {
      planInFlight.delete(uid);
    })
  );
  return pending;
}

export async function getActiveShareCountForOwner(ownerId: string): Promise<number> {
  const uid = normalizeUuid(ownerId);
  if (!uid) return 0;
  // Active = not revoked, not expired
  const rows = (await sql`
    select count(*)::int as c
    from public.share_tokens st
    join public.docs d on d.id = st.doc_id
    where d.owner_id = ${uid}::uuid
      and st.revoked_at is null
      and (st.expires_at is null or st.expires_at > now())
  `) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c ?? 0);
}

export async function getStorageBytesForOwner(ownerId: string): Promise<number> {
  const uid = normalizeUuid(ownerId);
  if (!uid) return 0;
  const rows = (await sql`
    select coalesce(sum(coalesce(d.size_bytes, 0)), 0)::bigint as total
    from public.docs d
    where d.owner_id = ${uid}::uuid
      and coalesce(d.status, 'ready') <> 'deleted'
  `) as unknown as Array<{ total: number | string | null }>;
  // neon returns bigint as string sometimes
  const v = rows?.[0]?.total ?? 0;
  return typeof v === "string" ? Number(v) : Number(v);
}

export async function getMonthlyViewCount(userId: string): Promise<number> {
  const uid = normalizeUuid(userId);
  if (!uid) return 0;
  const rows = (await sql`
    select view_count::int as v
    from public.user_usage_monthly
    where user_id = ${uid}::uuid
      and month = date_trunc('month', now())::date
    limit 1
  `) as unknown as Array<{ v: number }>;
  return Number(rows?.[0]?.v ?? 0);
}

export async function incrementMonthlyViews(userId: string, delta: number = 1): Promise<void> {
  const uid = normalizeUuid(userId);
  const safeDelta = Number.isFinite(delta) ? Math.max(0, Math.floor(delta)) : 0;
  if (!uid || safeDelta <= 0) return;
  await sql`
    insert into public.user_usage_monthly (user_id, month, view_count, upload_count)
    values (${uid}::uuid, date_trunc('month', now())::date, ${safeDelta}::int, 0)
    on conflict (user_id, month)
    do update set view_count = public.user_usage_monthly.view_count + ${safeDelta}::int
  `;
}

export async function getDailyUploadCount(userId: string): Promise<number> {
  const uid = normalizeUuid(userId);
  if (!uid) return 0;
  const rows = (await sql`
    select upload_count::int as u
    from public.user_usage_daily
    where user_id = ${uid}::uuid
      and day = (now() at time zone 'utc')::date
    limit 1
  `) as unknown as Array<{ u: number }>;
  return Number(rows?.[0]?.u ?? 0);
}

export async function incrementUploads(userId: string, delta: number = 1): Promise<void> {
  const uid = normalizeUuid(userId);
  const safeDelta = Number.isFinite(delta) ? Math.max(0, Math.floor(delta)) : 0;
  if (!uid || safeDelta <= 0) return;
  // daily
  await sql`
    insert into public.user_usage_daily (user_id, day, upload_count)
    values (${uid}::uuid, (now() at time zone 'utc')::date, ${safeDelta}::int)
    on conflict (user_id, day)
    do update set upload_count = public.user_usage_daily.upload_count + ${safeDelta}::int
  `;

  // monthly
  await sql`
    insert into public.user_usage_monthly (user_id, month, view_count, upload_count)
    values (${uid}::uuid, date_trunc('month', now())::date, 0, ${safeDelta}::int)
    on conflict (user_id, month)
    do update set upload_count = public.user_usage_monthly.upload_count + ${safeDelta}::int
  `;
}

export type LimitResult =
  | { ok: true }
  | { ok: false; error: "LIMIT_REACHED"; message: string };

export async function assertCanUpload(args: {
  userId: string;
  sizeBytes: number | null;
}): Promise<LimitResult> {
  const uid = normalizeUuid(args.userId);
  if (!uid) return { ok: false, error: "LIMIT_REACHED", message: "Invalid owner context." };
  const billingRes = await getBillingFlags();
  if (!billingRes.flags.enforcePlanLimits) return { ok: true };

  const plan = await getPlanForUser(uid);

  const sizeRaw = Number(args.sizeBytes ?? 0);
  const size = Number.isFinite(sizeRaw) ? Math.max(0, Math.floor(sizeRaw)) : 0;

  if (plan.maxFileSizeBytes != null && size > plan.maxFileSizeBytes) {
    return { ok: false, error: "LIMIT_REACHED", message: "File is too large for this account." };
  }

  if (plan.maxUploadsPerDay != null) {
    const used = await getDailyUploadCount(uid);
    if (used >= plan.maxUploadsPerDay) {
      return { ok: false, error: "LIMIT_REACHED", message: "Daily upload limit reached." };
    }
  }

  if (plan.maxStorageBytes != null) {
    const used = await getStorageBytesForOwner(uid);
    if (used + size > plan.maxStorageBytes) {
      return { ok: false, error: "LIMIT_REACHED", message: "Storage limit reached." };
    }
  }

  return { ok: true };
}

export async function assertCanCreateShare(ownerId: string): Promise<LimitResult> {
  const uid = normalizeUuid(ownerId);
  if (!uid) return { ok: false, error: "LIMIT_REACHED", message: "Invalid owner context." };
  const billingRes = await getBillingFlags();
  if (!billingRes.flags.enforcePlanLimits) return { ok: true };

  const plan = await getPlanForUser(uid);
  const active = await getActiveShareCountForOwner(uid);

  if (plan.id === "pro") {
    const softActiveShares = readEnvInt("PRO_SOFT_MAX_ACTIVE_SHARES", 1000, { min: 1 });
    if (active >= softActiveShares) {
      void logSecurityEvent({
        type: "pro_share_soft_cap_reached",
        severity: "medium",
        actorUserId: uid,
        scope: "share_create",
        message: "Pro active-share soft cap reached",
        meta: { activeShares: active, softCap: softActiveShares },
      });
      return { ok: false, error: "LIMIT_REACHED", message: "Active share limit reached for this account." };
    }

    const perMinute = await rateLimit({
      scope: "pro:share_create:user:min",
      id: uid,
      limit: readEnvInt("PRO_SHARE_CREATE_PER_MIN", 90, { min: 1 }),
      windowSeconds: 60,
      failClosed: true,
    });
    if (!perMinute.ok) {
      return { ok: false, error: "LIMIT_REACHED", message: "Too many share creates. Please retry shortly." };
    }

    const burst = await rateLimit({
      scope: "pro:share_create:user:burst",
      id: uid,
      limit: readEnvInt("PRO_SHARE_CREATE_BURST_LIMIT", 300, { min: 1 }),
      windowSeconds: readEnvInt("PRO_SHARE_CREATE_BURST_WINDOW_SECONDS", 300, { min: 1 }),
      failClosed: true,
    });
    if (!burst.ok) {
      return { ok: false, error: "LIMIT_REACHED", message: "Share creation burst limit reached. Please retry shortly." };
    }

    return { ok: true };
  }

  if (plan.maxActiveShares != null && active >= plan.maxActiveShares) {
    return { ok: false, error: "LIMIT_REACHED", message: "Active share limit reached." };
  }
  return { ok: true };
}

export async function assertCanServeView(ownerId: string): Promise<LimitResult> {
  const uid = normalizeUuid(ownerId);
  if (!uid) return { ok: false, error: "LIMIT_REACHED", message: "Invalid owner context." };
  const billingRes = await getBillingFlags();
  if (!billingRes.flags.enforcePlanLimits) return { ok: true };

  const overridden = await hasActiveViewLimitOverride(uid);
  if (overridden) return { ok: true };

  const plan = await getPlanForUser(uid);
  if (plan.id === "pro") {
    void maybeFlagHeavyProEgress(uid);
    const softViews = readEnvInt("PRO_SOFT_MAX_VIEWS_PER_MONTH", 50000, { min: 1 });
    const used = await getMonthlyViewCount(uid);
    if (used >= softViews) {
      const throttle = await rateLimit({
        scope: "pro:view_overage:user:min",
        id: uid,
        limit: readEnvInt("PRO_VIEW_OVERAGE_PER_MIN", 120, { min: 1 }),
        windowSeconds: 60,
        failClosed: true,
      });
      if (!throttle.ok) {
        return { ok: false, error: "LIMIT_REACHED", message: "Traffic temporarily throttled. Please retry shortly." };
      }

      const alertGate = await rateLimit({
        scope: "pro:view_soft_cap_alert:user:day",
        id: uid,
        limit: 1,
        windowSeconds: 86400,
        failClosed: true,
      });
      if (alertGate.ok && alertGate.count === 1) {
        void logSecurityEvent({
          type: "pro_view_soft_cap_exceeded",
          severity: "medium",
          actorUserId: uid,
          scope: "view_limit",
          message: "Pro monthly view soft cap exceeded",
          meta: { viewsUsed: used, softCap: softViews },
        });
      }
    }
    return { ok: true };
  }

  if (plan.maxViewsPerMonth == null) return { ok: true };

  const used = await getMonthlyViewCount(uid);
  if (used >= plan.maxViewsPerMonth) {
    return { ok: false, error: "LIMIT_REACHED", message: "Monthly view limit reached." };
  }
  return { ok: true };
}

export async function getMonthlyEstimatedEgressBytesForOwner(ownerId: string): Promise<number> {
  const uid = normalizeUuid(ownerId);
  if (!uid) return 0;
  try {
    const rows = (await sql`
      select coalesce(sum(coalesce(d.size_bytes, 0)), 0)::bigint as total
      from public.doc_views v
      join public.docs d on d.id = v.doc_id
      where d.owner_id = ${uid}::uuid
        and v.created_at >= date_trunc('month', now())
        and v.created_at < date_trunc('month', now()) + interval '1 month'
        and coalesce(d.status, 'ready') <> 'deleted'
    `) as unknown as Array<{ total: number | string }>;
    const total = rows?.[0]?.total ?? 0;
    return typeof total === "string" ? Number(total) : Number(total);
  } catch {
    return 0;
  }
}

async function maybeFlagHeavyProEgress(ownerId: string): Promise<void> {
  const uid = normalizeUuid(ownerId);
  if (!uid) return;
  const probeGate = await rateLimit({
    scope: "pro:egress_probe:user:15m",
    id: uid,
    limit: 1,
    windowSeconds: 900,
    failClosed: true,
  });
  if (!(probeGate.ok && probeGate.count === 1)) return;

  const softCap = readEnvInt("PRO_SOFT_MAX_EGRESS_BYTES", 30 * 1024 * 1024 * 1024, { min: 1 });
  const estimated = await getMonthlyEstimatedEgressBytesForOwner(uid);
  if (estimated < softCap) return;

  const alertGate = await rateLimit({
    scope: "pro:egress_alert:user:day",
    id: uid,
    limit: 1,
    windowSeconds: 86400,
    failClosed: true,
  });
  if (!(alertGate.ok && alertGate.count === 1)) return;

  await logSecurityEvent({
    type: "pro_egress_soft_cap_exceeded",
    severity: "high",
    actorUserId: uid,
    scope: "bandwidth_guardrail",
    message: "Estimated monthly egress exceeded Pro soft cap",
    meta: { estimatedBytes: estimated, softCapBytes: softCap },
  });
}

export type OwnerEgressRow = {
  ownerId: string;
  email: string | null;
  estimatedBytes: number;
};

export async function getTopOwnersByMonthlyEstimatedEgress(limit: number = 20): Promise<OwnerEgressRow[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  try {
    const rows = (await sql`
      select
        d.owner_id::text as owner_id,
        max(u.email)::text as email,
        coalesce(sum(coalesce(d.size_bytes, 0)), 0)::bigint as estimated_bytes
      from public.doc_views v
      join public.docs d on d.id = v.doc_id
      left join public.users u on u.id = d.owner_id
      where v.created_at >= date_trunc('month', now())
        and v.created_at < date_trunc('month', now()) + interval '1 month'
        and coalesce(d.status, 'ready') <> 'deleted'
      group by d.owner_id
      order by estimated_bytes desc
      limit ${safeLimit}
    `) as unknown as Array<{ owner_id: string; email: string | null; estimated_bytes: number | string }>;

    return rows.map((r) => ({
      ownerId: r.owner_id,
      email: r.email ?? null,
      estimatedBytes: typeof r.estimated_bytes === "string" ? Number(r.estimated_bytes) : Number(r.estimated_bytes),
    }));
  } catch {
    return [];
  }
}

/**
 * Custom expiration is currently hidden. If the plan disallows it, we clamp expiry to a safe default.
 * Returns an ISO string or null.
 */
export function normalizeExpiresAtForPlan(args: {
  plan: Plan;
  requestedExpiresAtIso: string | null;
  defaultDaysIfNotAllowed?: number;
}): string | null {
  const req = args.requestedExpiresAtIso;
  if (!req && args.plan.allowCustomExpiration) return null;

  if (args.plan.allowCustomExpiration) {
    const t = Date.parse(String(req || ""));
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString();
  }

  // Plan disallows custom expiration (e.g. Free tier):
  // always enforce a fixed TTL from now, ignoring caller-provided timestamps.
  // Product policy: Free-tier links must expire and cannot exceed 7 days.
  const configured = Number(process.env.FREE_SHARE_TTL_DAYS || 7);
  const requested = Number(args.defaultDaysIfNotAllowed ?? configured);
  const days = Math.max(1, Math.min(7, Math.floor(Number.isFinite(requested) ? requested : 7)));
  const fixedT = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(fixedT).toISOString();
}

export function normalizeMaxViewsForPlan(args: {
  plan: Plan;
  requestedMaxViews: number | null;
}): number | null {
  const requested = args.requestedMaxViews;
  // Pro/unlimited plans can keep unlimited semantics.
  if (args.plan.maxViewsPerMonth == null) {
    return requested == null ? null : Math.max(0, Math.floor(requested));
  }

  // Finite plans (Free): disallow unlimited share view links.
  const freeDefault = Math.max(1, Number(process.env.FREE_DEFAULT_SHARE_MAX_VIEWS || 25));
  const normalized = requested == null ? freeDefault : Math.max(0, Math.floor(requested));
  if (normalized <= 0) return freeDefault;
  return Math.min(normalized, args.plan.maxViewsPerMonth);
}
