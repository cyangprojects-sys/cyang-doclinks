// src/lib/masterKeys.ts
import { sql } from "@/lib/db";
import { type ActiveMasterKey } from "@/lib/encryption";
import { getActiveMasterKey, getMasterKeyById } from "@/lib/encryption";

export type MasterKeyStatus = {
  id: string;
  active: boolean;
  revoked: boolean;
};

export type MasterKeyChange = {
  id: string;
  created_at: string;
  changed_by_user_id: string | null;
  previous_key_id: string | null;
  new_key_id: string;
  reason: string | null;
  rollback_of_change_id: string | null;
};

async function revocationsTableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.master_key_revocations')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

async function settingsTableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.master_key_settings')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

async function changesTableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.master_key_changes')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

function getEnvKeyIds(): string[] {
  const envKeys: string[] = [];
  try {
    const raw = process.env.DOC_MASTER_KEYS;
    if (!raw) return envKeys;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return envKeys;
    for (const k of parsed) {
      if (k && typeof k.id === "string") envKeys.push(k.id);
    }
  } catch {
    // ignore
  }
  return Array.from(new Set(envKeys));
}

export async function getDbActiveMasterKeyId(): Promise<string | null> {
  if (!(await settingsTableExists())) return null;
  try {
    const rows = (await sql`
      select active_key_id::text as active_key_id
      from public.master_key_settings
      where id = true
      limit 1
    `) as unknown as Array<{ active_key_id: string | null }>;
    const keyId = String(rows?.[0]?.active_key_id || "").trim();
    return keyId || null;
  } catch {
    return null;
  }
}

export async function getEffectiveActiveMasterKeyId(): Promise<string | null> {
  const dbActive = await getDbActiveMasterKeyId();
  if (dbActive) return dbActive;
  try {
    return getActiveMasterKey().id;
  } catch {
    return null;
  }
}

export async function listMasterKeysWithStatus(): Promise<MasterKeyStatus[]> {
  const activeId = await getEffectiveActiveMasterKeyId();
  const envKeys = getEnvKeyIds();

  const revoked = new Set<string>();
  if (await revocationsTableExists()) {
    try {
      const rows = (await sql`
        select key_id::text as key_id
        from public.master_key_revocations
      `) as unknown as Array<{ key_id: string }>;
      for (const r of rows) revoked.add(r.key_id);
    } catch {
      // ignore
    }
  }

  // De-dupe preserving order
  const seen = new Set<string>();
  const out: MasterKeyStatus[] = [];
  for (const id of envKeys) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, active: !!activeId && id === activeId, revoked: revoked.has(id) });
  }
  return out;
}

export async function getActiveMasterKeyOrThrow(): Promise<ActiveMasterKey> {
  const activeId = await getEffectiveActiveMasterKeyId();
  if (!activeId) throw new Error("MISSING_DOC_MASTER_KEYS");
  const mk = getMasterKeyById(activeId);
  // Enforce DB-based revocation
  if (await isMasterKeyRevoked(mk.id)) {
    throw new Error("MASTER_KEY_REVOKED");
  }
  return mk;
}

export async function getMasterKeyByIdOrThrow(id: string): Promise<ActiveMasterKey> {
  const mk = getMasterKeyById(id);
  if (await isMasterKeyRevoked(mk.id)) {
    throw new Error("MASTER_KEY_REVOKED");
  }
  return mk;
}

export async function isMasterKeyRevoked(id: string): Promise<boolean> {
  if (!(await revocationsTableExists())) return false;
  try {
    const rows = (await sql`
      select 1
      from public.master_key_revocations
      where key_id = ${id}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function revokeMasterKey(args: { id: string; actorUserId: string | null }): Promise<void> {
  if (!(await revocationsTableExists())) {
    throw new Error("MISSING_MASTER_KEY_TABLE");
  }
  const id = String(args.id || "").trim();
  if (!id) throw new Error("BAD_REQUEST");
  await sql`
    insert into public.master_key_revocations (key_id, revoked_by_user_id)
    values (${id}, ${args.actorUserId ? args.actorUserId : null}::uuid)
    on conflict (key_id) do nothing
  `;
}

export async function setActiveMasterKey(args: {
  keyId: string;
  actorUserId: string | null;
  reason?: string | null;
  rollbackOfChangeId?: string | null;
}): Promise<void> {
  if (!(await settingsTableExists())) throw new Error("MISSING_MASTER_KEY_SETTINGS_TABLE");

  const keyId = String(args.keyId || "").trim();
  if (!keyId) throw new Error("BAD_REQUEST");

  const envIds = getEnvKeyIds();
  if (!envIds.includes(keyId)) throw new Error("MASTER_KEY_NOT_IN_ENV");
  if (await isMasterKeyRevoked(keyId)) throw new Error("MASTER_KEY_REVOKED");

  const previous = await getDbActiveMasterKeyId();
  await sql`
    insert into public.master_key_settings (id, active_key_id, updated_by_user_id, notes, updated_at)
    values (true, ${keyId}, ${args.actorUserId ? args.actorUserId : null}::uuid, ${args.reason ?? null}, now())
    on conflict (id) do update set
      active_key_id = excluded.active_key_id,
      updated_by_user_id = excluded.updated_by_user_id,
      notes = excluded.notes,
      updated_at = now()
  `;

  if (await changesTableExists()) {
    await sql`
      insert into public.master_key_changes
        (changed_by_user_id, previous_key_id, new_key_id, reason, rollback_of_change_id)
      values
        (${args.actorUserId ? args.actorUserId : null}::uuid, ${previous ?? null}, ${keyId}, ${args.reason ?? null}, ${args.rollbackOfChangeId ?? null}::uuid)
    `;
  }
}

export async function listRecentMasterKeyChanges(limit: number = 25): Promise<MasterKeyChange[]> {
  if (!(await changesTableExists())) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  try {
    return (await sql`
      select
        id::text as id,
        created_at::text as created_at,
        changed_by_user_id::text as changed_by_user_id,
        previous_key_id::text as previous_key_id,
        new_key_id::text as new_key_id,
        reason::text as reason,
        rollback_of_change_id::text as rollback_of_change_id
      from public.master_key_changes
      order by created_at desc
      limit ${safeLimit}
    `) as unknown as MasterKeyChange[];
  } catch {
    return [];
  }
}

export async function countDocsEncryptedWithKey(keyId: string): Promise<number> {
  const rows = (await sql`
    select count(*)::int as c
    from public.docs
    where coalesce(encryption_enabled, false) = true
      and coalesce(enc_key_version, '') = ${keyId}
  `) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c ?? 0);
}

export async function rotateDocKeys(args: {
  fromKeyId: string;
  toKeyId?: string; // default: current active
  limit?: number; // safety cap
}): Promise<{ scanned: number; rotated: number; failed: number; remaining: number }> {
  const fromKeyId = String(args.fromKeyId || "").trim();
  if (!fromKeyId) throw new Error("BAD_REQUEST");

  const toKey = args.toKeyId ? await getMasterKeyByIdOrThrow(args.toKeyId) : await getActiveMasterKeyOrThrow();
  const fromKey = await getMasterKeyByIdOrThrow(fromKeyId);

  if (fromKey.id === toKey.id) return { scanned: 0, rotated: 0, failed: 0, remaining: 0 };

  const limit = Math.max(1, Math.min(Number(args.limit ?? 250), 2000));

  // Load a batch of docs encrypted with fromKey
  const docs = (await sql`
    select
      id::text as id,
      enc_wrapped_key as enc_wrapped_key,
      enc_wrap_iv as enc_wrap_iv,
      enc_wrap_tag as enc_wrap_tag
    from public.docs
    where coalesce(encryption_enabled, false) = true
      and coalesce(enc_key_version, '') = ${fromKey.id}
      and enc_wrapped_key is not null
      and enc_wrap_iv is not null
      and enc_wrap_tag is not null
    order by created_at desc
    limit ${limit}
  `) as unknown as Array<{
    id: string;
    enc_wrapped_key: Buffer;
    enc_wrap_iv: Buffer;
    enc_wrap_tag: Buffer;
  }>;

  if (!docs.length) return { scanned: 0, rotated: 0, failed: 0, remaining: 0 };

  const { unwrapDataKey, wrapDataKey } = await import("@/lib/encryption");

  let rotated = 0;
  let failed = 0;
  for (const d of docs) {
    try {
      const dataKey = unwrapDataKey({
        wrapped: d.enc_wrapped_key,
        wrapIv: d.enc_wrap_iv,
        wrapTag: d.enc_wrap_tag,
        masterKey: fromKey.key,
      });

      const wrap = wrapDataKey({ dataKey, masterKey: toKey.key });

      await sql`
        update public.docs
        set
          enc_key_version = ${toKey.id},
          enc_wrapped_key = ${wrap.wrapped},
          enc_wrap_iv = ${wrap.iv},
          enc_wrap_tag = ${wrap.tag}
        where id = ${d.id}::uuid
      `;

      rotated += 1;
    } catch {
      failed += 1;
    }
  }

  const remaining = await countDocsEncryptedWithKey(fromKey.id);
  return { scanned: docs.length, rotated, failed, remaining };
}
