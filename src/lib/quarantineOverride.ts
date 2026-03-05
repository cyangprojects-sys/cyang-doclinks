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
    const rows = (await sql`select to_regclass('public.doc_quarantine_overrides')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export async function hasActiveQuarantineOverride(docId: string): Promise<boolean> {
  const safeDocId = normalizeUuidOrNull(docId);
  if (!safeDocId) return false;
  if (!(await tableExists())) return false;
  try {
    const rows = (await sql`
      select 1
      from public.doc_quarantine_overrides
      where doc_id = ${safeDocId}::uuid
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
  const safeDocId = normalizeUuidOrNull(args.docId);
  if (!safeDocId) throw new Error("INVALID_DOC_ID");
  const safeActorUserId = normalizeUuidOrNull(args.actorUserId);
  const ttl = boundedInt(args.ttlMinutes ?? 30, 30, 1, 1440);
  const reason = normalizeReason(args.reason);
  const rows = (await sql`
    insert into public.doc_quarantine_overrides
      (doc_id, created_by_user_id, reason, expires_at)
    values
      (${safeDocId}::uuid, ${safeActorUserId}::uuid, ${reason}, now() + (${ttl}::text || ' minutes')::interval)
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
  const safeDocId = normalizeUuidOrNull(args.docId);
  if (!safeDocId) return 0;
  const safeActorUserId = normalizeUuidOrNull(args.actorUserId);
  const reason = normalizeReason(args.reason);
  const rows = (await sql`
    with u as (
      update public.doc_quarantine_overrides
      set
        revoked_at = now(),
        revoked_by_user_id = ${safeActorUserId}::uuid,
        revoke_reason = ${reason}
      where doc_id = ${safeDocId}::uuid
        and revoked_at is null
        and expires_at > now()
      returning 1
    )
    select count(*)::int as c from u
  `) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c ?? 0);
}
