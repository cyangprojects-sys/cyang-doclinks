import { sql } from "@/lib/db";

async function tableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.owner_view_limit_overrides')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export async function getActiveViewLimitOverride(ownerId: string): Promise<{ expiresAt: string; reason: string | null } | null> {
  if (!ownerId) return null;
  if (!(await tableExists())) return null;
  try {
    const rows = (await sql`
      select expires_at::text as expires_at, reason::text as reason
      from public.owner_view_limit_overrides
      where owner_id = ${ownerId}::uuid
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
  const hours = Math.max(1, Math.min(720, Math.floor(args.hours)));
  await sql`
    insert into public.owner_view_limit_overrides
      (owner_id, created_by_user_id, reason, expires_at, created_at)
    values
      (${args.ownerId}::uuid, ${args.actorUserId ?? null}::uuid, ${args.reason ?? null}, now() + (${hours}::text || ' hours')::interval, now())
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
  await sql`delete from public.owner_view_limit_overrides where owner_id = ${ownerId}::uuid`;
}
