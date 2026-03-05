import { sql } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REASON_LEN = 240;

function normalizeUuidOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeReason(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, MAX_REASON_LEN);
}

async function tableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.owner_view_limit_overrides')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export async function getActiveViewLimitOverride(ownerId: string): Promise<{ expiresAt: string; reason: string | null } | null> {
  const safeOwnerId = normalizeUuidOrNull(ownerId);
  if (!safeOwnerId) return null;
  if (!(await tableExists())) return null;
  try {
    const rows = (await sql`
      select expires_at::text as expires_at, reason::text as reason
      from public.owner_view_limit_overrides
      where owner_id = ${safeOwnerId}::uuid
        and expires_at > now()
      limit 1
    `) as unknown as Array<{ expires_at: string; reason: string | null }>;
    const r = rows?.[0];
    if (!r?.expires_at) return null;
    return { expiresAt: r.expires_at, reason: r.reason ?? null };
  } catch {
    return null;
  }
}

export async function hasActiveViewLimitOverride(ownerId: string): Promise<boolean> {
  return (await getActiveViewLimitOverride(ownerId)) != null;
}

export async function setViewLimitOverride(args: {
  ownerId: string;
  actorUserId: string | null;
  hours: number;
  reason?: string | null;
}) {
  if (!(await tableExists())) throw new Error("MISSING_VIEW_LIMIT_OVERRIDE_TABLE");
  const safeOwnerId = normalizeUuidOrNull(args.ownerId);
  if (!safeOwnerId) throw new Error("INVALID_OWNER_ID");
  const safeActorUserId = normalizeUuidOrNull(args.actorUserId);
  const hours = boundedInt(args.hours, 24, 1, 720);
  const reason = normalizeReason(args.reason);
  await sql`
    insert into public.owner_view_limit_overrides
      (owner_id, created_by_user_id, reason, expires_at, created_at)
    values
      (${safeOwnerId}::uuid, ${safeActorUserId}::uuid, ${reason}, now() + (${hours}::text || ' hours')::interval, now())
    on conflict (owner_id) do update
      set
        created_by_user_id = excluded.created_by_user_id,
        reason = excluded.reason,
        expires_at = excluded.expires_at,
        created_at = now()
  `;
}

export async function clearViewLimitOverride(ownerId: string) {
  if (!(await tableExists())) return;
  const safeOwnerId = normalizeUuidOrNull(ownerId);
  if (!safeOwnerId) return;
  await sql`delete from public.owner_view_limit_overrides where owner_id = ${safeOwnerId}::uuid`;
}
