import { sql } from "@/lib/db";
import { getBillingFlags } from "@/lib/settings";
import { hasActiveViewLimitOverride } from "@/lib/viewLimitOverride";
import { rateLimit } from "@/lib/rateLimit";
import { logSecurityEvent } from "@/lib/securityTelemetry";

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

const FREE_PLAN: Plan = {
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

const PRO_PLAN: Plan = {
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
  if (!(await billingSubscriptionsTableExists())) return false;
  try {
    const rows = (await sql`
      select 1
      from public.billing_subscriptions bs
      where bs.user_id = ${userId}::uuid
        and bs.plan_id = 'pro'
        and (
          lower(coalesce(bs.status, '')) in ('active', 'trialing')
          or (
            lower(coalesce(bs.status, '')) in ('past_due', 'grace')
            and bs.grace_until is not null
            and bs.grace_until > now()
          )
        )
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getPlanForUser(userId: string): Promise<Plan> {
  const billingRes = await getBillingFlags();
  const billing = billingRes.flags;

  const rows = (await sql`
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
    where u.id = ${userId}::uuid
    limit 1
  `) as unknown as Array<any>;

  const r = rows?.[0];
  if (!r) {
    // Fail closed to Free if user row exists but plan missing.
    return FREE_PLAN;
  }

  // Product invariant: owner accounts are never constrained by plan limits.
  if (String(r.role || "").toLowerCase() === "owner") {
    return OWNER_UNLIMITED_PLAN;
  }

  // Free policy is a product invariant; enforce canonical values even if DB row is stale.
  if (String(r.id) === "free") return FREE_PLAN;

  // Hidden pricing flag: "pro" is present but does not grant unlimited behavior until enabled.
  if (String(r.id) === "pro" && !billing.proPlanEnabled) {
    return FREE_PLAN;
  }

  // Optional Stripe entitlement hardening:
  // when enabled, users marked "pro" without active paid entitlement are treated as Free.
  if (String(r.id) === "pro") {
    const enforceStripeEntitlement = String(process.env.STRIPE_ENFORCE_ENTITLEMENT || "1").trim() !== "0";
    if (enforceStripeEntitlement) {
      const entitled = await userHasActiveProEntitlement(userId);
      if (!entitled) {
        return FREE_PLAN;
      }
    }
    // Pro policy invariant: enforce canonical product limits/features.
    return PRO_PLAN;
  }

  return {
    id: r.id,
    name: r.name,
    maxViewsPerMonth: r.max_views_per_month ?? null,
    maxActiveShares: r.max_active_shares ?? null,
    maxStorageBytes: r.max_storage_bytes ?? null,
    maxUploadsPerDay: r.max_uploads_per_day ?? null,
    maxFileSizeBytes: r.max_file_size_bytes ?? null,
    allowCustomExpiration: Boolean(r.allow_custom_expiration),
    allowAuditExport: Boolean(r.allow_audit_export),
    allowAdvancedAnalytics: String(r.id) !== "free",
  };
}

export async function getOwnerIdForDoc(docId: string): Promise<string | null> {
  const rows = (await sql`
    select owner_id::text as owner_id
    from public.docs
    where id = ${docId}::uuid
    limit 1
  `) as unknown as Array<{ owner_id: string | null }>;
  return rows?.[0]?.owner_id ?? null;
}

export async function getActiveShareCountForOwner(ownerId: string): Promise<number> {
  // Active = not revoked, not expired
  const rows = (await sql`
    select count(*)::int as c
    from public.share_tokens st
    join public.docs d on d.id = st.doc_id
    where d.owner_id = ${ownerId}::uuid
      and st.revoked_at is null
      and (st.expires_at is null or st.expires_at > now())
  `) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c ?? 0);
}

export async function getStorageBytesForOwner(ownerId: string): Promise<number> {
  const rows = (await sql`
    select coalesce(sum(coalesce(d.size_bytes, 0)), 0)::bigint as total
    from public.docs d
    where d.owner_id = ${ownerId}::uuid
      and coalesce(d.status, 'ready') <> 'deleted'
  `) as unknown as Array<{ total: any }>;
  // neon returns bigint as string sometimes
  const v = rows?.[0]?.total ?? 0;
  return typeof v === "string" ? Number(v) : Number(v);
}

export async function getMonthlyViewCount(userId: string): Promise<number> {
  const rows = (await sql`
    select view_count::int as v
    from public.user_usage_monthly
    where user_id = ${userId}::uuid
      and month = date_trunc('month', now())::date
    limit 1
  `) as unknown as Array<{ v: number }>;
  return Number(rows?.[0]?.v ?? 0);
}

export async function incrementMonthlyViews(userId: string, delta: number = 1): Promise<void> {
  await sql`
    insert into public.user_usage_monthly (user_id, month, view_count, upload_count)
    values (${userId}::uuid, date_trunc('month', now())::date, ${delta}::int, 0)
    on conflict (user_id, month)
    do update set view_count = public.user_usage_monthly.view_count + ${delta}::int
  `;
}

export async function getDailyUploadCount(userId: string): Promise<number> {
  const rows = (await sql`
    select upload_count::int as u
    from public.user_usage_daily
    where user_id = ${userId}::uuid
      and day = (now() at time zone 'utc')::date
    limit 1
  `) as unknown as Array<{ u: number }>;
  return Number(rows?.[0]?.u ?? 0);
}

export async function incrementUploads(userId: string, delta: number = 1): Promise<void> {
  // daily
  await sql`
    insert into public.user_usage_daily (user_id, day, upload_count)
    values (${userId}::uuid, (now() at time zone 'utc')::date, ${delta}::int)
    on conflict (user_id, day)
    do update set upload_count = public.user_usage_daily.upload_count + ${delta}::int
  `;

  // monthly
  await sql`
    insert into public.user_usage_monthly (user_id, month, view_count, upload_count)
    values (${userId}::uuid, date_trunc('month', now())::date, 0, ${delta}::int)
    on conflict (user_id, month)
    do update set upload_count = public.user_usage_monthly.upload_count + ${delta}::int
  `;
}

export type LimitResult =
  | { ok: true }
  | { ok: false; error: "LIMIT_REACHED"; message: string };

function envInt(name: string, fallback: number, min: number = 1): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.floor(raw));
}

export async function assertCanUpload(args: {
  userId: string;
  sizeBytes: number | null;
}): Promise<LimitResult> {
  const billingRes = await getBillingFlags();
  if (!billingRes.flags.enforcePlanLimits) return { ok: true };

  const plan = await getPlanForUser(args.userId);

  const size = args.sizeBytes ?? 0;

  if (plan.maxFileSizeBytes != null && size > plan.maxFileSizeBytes) {
    return { ok: false, error: "LIMIT_REACHED", message: "File is too large for this account." };
  }

  if (plan.maxUploadsPerDay != null) {
    const used = await getDailyUploadCount(args.userId);
    if (used >= plan.maxUploadsPerDay) {
      return { ok: false, error: "LIMIT_REACHED", message: "Daily upload limit reached." };
    }
  }

  if (plan.maxStorageBytes != null) {
    const used = await getStorageBytesForOwner(args.userId);
    if (used + size > plan.maxStorageBytes) {
      return { ok: false, error: "LIMIT_REACHED", message: "Storage limit reached." };
    }
  }

  return { ok: true };
}

export async function assertCanCreateShare(ownerId: string): Promise<LimitResult> {
  const billingRes = await getBillingFlags();
  if (!billingRes.flags.enforcePlanLimits) return { ok: true };

  const plan = await getPlanForUser(ownerId);
  const active = await getActiveShareCountForOwner(ownerId);

  if (plan.id === "pro") {
    const softActiveShares = envInt("PRO_SOFT_MAX_ACTIVE_SHARES", 1000);
    if (active >= softActiveShares) {
      void logSecurityEvent({
        type: "pro_share_soft_cap_reached",
        severity: "medium",
        actorUserId: ownerId,
        scope: "share_create",
        message: "Pro active-share soft cap reached",
        meta: { activeShares: active, softCap: softActiveShares },
      });
      return { ok: false, error: "LIMIT_REACHED", message: "Active share limit reached for this account." };
    }

    const perMinute = await rateLimit({
      scope: "pro:share_create:user:min",
      id: ownerId,
      limit: envInt("PRO_SHARE_CREATE_PER_MIN", 90),
      windowSeconds: 60,
    });
    if (!perMinute.ok) {
      return { ok: false, error: "LIMIT_REACHED", message: "Too many share creates. Please retry shortly." };
    }

    const burst = await rateLimit({
      scope: "pro:share_create:user:burst",
      id: ownerId,
      limit: envInt("PRO_SHARE_CREATE_BURST_LIMIT", 300),
      windowSeconds: envInt("PRO_SHARE_CREATE_BURST_WINDOW_SECONDS", 300),
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
  const billingRes = await getBillingFlags();
  if (!billingRes.flags.enforcePlanLimits) return { ok: true };

  const overridden = await hasActiveViewLimitOverride(ownerId);
  if (overridden) return { ok: true };

  const plan = await getPlanForUser(ownerId);
  if (plan.id === "pro") {
    void maybeFlagHeavyProEgress(ownerId);
    const softViews = envInt("PRO_SOFT_MAX_VIEWS_PER_MONTH", 50000);
    const used = await getMonthlyViewCount(ownerId);
    if (used >= softViews) {
      const throttle = await rateLimit({
        scope: "pro:view_overage:user:min",
        id: ownerId,
        limit: envInt("PRO_VIEW_OVERAGE_PER_MIN", 120),
        windowSeconds: 60,
      });
      if (!throttle.ok) {
        return { ok: false, error: "LIMIT_REACHED", message: "Traffic temporarily throttled. Please retry shortly." };
      }

      const alertGate = await rateLimit({
        scope: "pro:view_soft_cap_alert:user:day",
        id: ownerId,
        limit: 1,
        windowSeconds: 86400,
      });
      if (alertGate.ok && alertGate.count === 1) {
        void logSecurityEvent({
          type: "pro_view_soft_cap_exceeded",
          severity: "medium",
          actorUserId: ownerId,
          scope: "view_limit",
          message: "Pro monthly view soft cap exceeded",
          meta: { viewsUsed: used, softCap: softViews },
        });
      }
    }
    return { ok: true };
  }

  if (plan.maxViewsPerMonth == null) return { ok: true };

  const used = await getMonthlyViewCount(ownerId);
  if (used >= plan.maxViewsPerMonth) {
    return { ok: false, error: "LIMIT_REACHED", message: "Monthly view limit reached." };
  }
  return { ok: true };
}

export async function getMonthlyEstimatedEgressBytesForOwner(ownerId: string): Promise<number> {
  try {
    const rows = (await sql`
      select coalesce(sum(coalesce(d.size_bytes, 0)), 0)::bigint as total
      from public.doc_views v
      join public.docs d on d.id = v.doc_id
      where d.owner_id = ${ownerId}::uuid
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
  const probeGate = await rateLimit({
    scope: "pro:egress_probe:user:15m",
    id: ownerId,
    limit: 1,
    windowSeconds: 900,
  });
  if (!(probeGate.ok && probeGate.count === 1)) return;

  const softCap = envInt("PRO_SOFT_MAX_EGRESS_BYTES", 30 * 1024 * 1024 * 1024);
  const estimated = await getMonthlyEstimatedEgressBytesForOwner(ownerId);
  if (estimated < softCap) return;

  const alertGate = await rateLimit({
    scope: "pro:egress_alert:user:day",
    id: ownerId,
    limit: 1,
    windowSeconds: 86400,
  });
  if (!(alertGate.ok && alertGate.count === 1)) return;

  await logSecurityEvent({
    type: "pro_egress_soft_cap_exceeded",
    severity: "high",
    actorUserId: ownerId,
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
