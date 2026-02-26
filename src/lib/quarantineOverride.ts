import { sql } from "@/lib/db";

async function tableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.doc_quarantine_overrides')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export async function hasActiveQuarantineOverride(docId: string): Promise<boolean> {
  if (!docId) return false;
  if (!(await tableExists())) return false;
  try {
    const rows = (await sql`
      select 1
      from public.doc_quarantine_overrides
      where doc_id = ${docId}::uuid
        and revoked_at is null
        and expires_at > now()
      order by created_at desc
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function createQuarantineOverride(args: {
  docId: string;
  actorUserId: string | null;
  reason?: string | null;
  ttlMinutes?: number;
}) {
  if (!(await tableExists())) throw new Error("MISSING_QUARANTINE_OVERRIDE_TABLE");
  const ttl = Math.max(1, Math.min(1440, Number(args.ttlMinutes ?? 30)));
  const rows = (await sql`
    insert into public.doc_quarantine_overrides
      (doc_id, created_by_user_id, reason, expires_at)
    values
      (${args.docId}::uuid, ${args.actorUserId ?? null}::uuid, ${args.reason ?? null}, now() + (${ttl}::text || ' minutes')::interval)
    returning id::text as id, expires_at::text as expires_at
  `) as unknown as Array<{ id: string; expires_at: string }>;
  return rows?.[0] ?? null;
}

export async function revokeActiveQuarantineOverride(args: {
  docId: string;
  actorUserId: string | null;
  reason?: string | null;
}) {
  if (!(await tableExists())) return 0;
  const rows = (await sql`
    with u as (
      update public.doc_quarantine_overrides
      set
        revoked_at = now(),
        revoked_by_user_id = ${args.actorUserId ?? null}::uuid,
        revoke_reason = ${args.reason ?? null}
      where doc_id = ${args.docId}::uuid
        and revoked_at is null
        and expires_at > now()
      returning 1
    )
    select count(*)::int as c from u
  `) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c ?? 0);
}
