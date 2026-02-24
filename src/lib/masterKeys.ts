// src/lib/masterKeys.ts
import { sql } from "@/lib/db";
import { type ActiveMasterKey } from "@/lib/encryption";
import { getActiveMasterKey, getMasterKeyById } from "@/lib/encryption";

export type MasterKeyStatus = {
  id: string;
  active: boolean;
  revoked: boolean;
};

async function revocationsTableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.master_key_revocations')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export async function listMasterKeysWithStatus(): Promise<MasterKeyStatus[]> {
  // Env keys (source of truth for key material)
  let activeId: string | null = null;
  try {
    activeId = getActiveMasterKey().id;
  } catch {
    activeId = null;
  }

  const envKeys: { id: string }[] = [];
  try {
    // parse via getMasterKeyById helper by reading env JSON in encryption.ts (indirect)
    const raw = process.env.DOC_MASTER_KEYS;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const k of parsed) {
          if (k && typeof k.id === "string") envKeys.push({ id: k.id });
        }
      }
    }
  } catch {
    // ignore
  }

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
  for (const k of envKeys) {
    if (!k?.id || seen.has(k.id)) continue;
    seen.add(k.id);
    out.push({ id: k.id, active: !!activeId && k.id === activeId, revoked: revoked.has(k.id) });
  }
  return out;
}

export async function getActiveMasterKeyOrThrow(): Promise<ActiveMasterKey> {
  const mk = getActiveMasterKey(); // validates env + length
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

export async function rotateDocKeys(args: {
  fromKeyId: string;
  toKeyId?: string; // default: current active
  limit?: number; // safety cap
}): Promise<{ rotated: number }> {
  const fromKeyId = String(args.fromKeyId || "").trim();
  if (!fromKeyId) throw new Error("BAD_REQUEST");

  const toKey = args.toKeyId ? await getMasterKeyByIdOrThrow(args.toKeyId) : await getActiveMasterKeyOrThrow();
  const fromKey = await getMasterKeyByIdOrThrow(fromKeyId);

  if (fromKey.id === toKey.id) return { rotated: 0 };

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

  if (!docs.length) return { rotated: 0 };

  const { unwrapDataKey, wrapDataKey } = await import("@/lib/encryption");

  let rotated = 0;
  for (const d of docs) {
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
  }

  return { rotated };
}
