import { sql } from "@/lib/db";

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
};

export async function getPlanForUser(userId: string): Promise<Plan> {
  const rows = (await sql`
    select
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
    return {
      id: "free",
      name: "Free",
      maxViewsPerMonth: 100,
      maxActiveShares: 3,
      maxStorageBytes: 524288000,
      maxUploadsPerDay: 10,
      maxFileSizeBytes: 26214400,
      allowCustomExpiration: false,
      allowAuditExport: false,
    };
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

export async function assertCanUpload(args: {
  userId: string;
  sizeBytes: number | null;
}): Promise<LimitResult> {
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
  const plan = await getPlanForUser(ownerId);
  if (plan.maxActiveShares == null) return { ok: true };

  const active = await getActiveShareCountForOwner(ownerId);
  if (active >= plan.maxActiveShares) {
    return { ok: false, error: "LIMIT_REACHED", message: "Active share limit reached." };
  }
  return { ok: true };
}

export async function assertCanServeView(ownerId: string): Promise<LimitResult> {
  const plan = await getPlanForUser(ownerId);
  if (plan.maxViewsPerMonth == null) return { ok: true };

  const used = await getMonthlyViewCount(ownerId);
  if (used >= plan.maxViewsPerMonth) {
    return { ok: false, error: "LIMIT_REACHED", message: "Monthly view limit reached." };
  }
  return { ok: true };
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
  if (!req) return null;

  const t = Date.parse(req);
  if (Number.isNaN(t)) return null;

  if (args.plan.allowCustomExpiration) return new Date(t).toISOString();

  const days = args.defaultDaysIfNotAllowed ?? 14;
  const maxT = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(Math.min(t, maxT)).toISOString();
}
