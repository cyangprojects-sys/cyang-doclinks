// src/lib/apiAuth.ts
// API key authentication for programmatic endpoints.

import { sql } from "@/lib/db";
import { constantTimeEqual, hashApiKey } from "@/lib/apiKeys";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_API_KEY_LEN = 512;
const MAX_SUFFIX_LEN = 256;

export type ApiAuthResult =
  | { ok: true; ownerId: string; apiKeyId: string; prefix: string }
  | { ok: false; status: number; error: string };

function normalizeUuidOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function extractApiKey(req: Request): string | null {
  const h = req.headers;

  const x = (h.get("x-api-key") || "").trim().slice(0, MAX_API_KEY_LEN);
  if (x) return x;

  const auth = (h.get("authorization") || "").trim().slice(0, MAX_API_KEY_LEN);
  if (!auth) return null;

  // Bearer <key>
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  return auth;
}

function extractPrefix(plaintext: string): string | null {
  // Expected: cyk_<prefix>_<random>
  // Store prefix as "cyk_<prefix>".
  const parts = plaintext.split("_");
  if (parts.length < 3) return null;
  if (parts[0] !== "cyk") return null;
  const p = parts[1];
  if (!/^[a-f0-9]{8}$/i.test(p)) return null;
  const remainder = parts.slice(2).join("_").trim().slice(0, MAX_SUFFIX_LEN);
  if (!remainder) return null;
  return `cyk_${p}`;
}

export async function verifyApiKeyFromRequest(req: Request): Promise<ApiAuthResult> {
  const plaintext = extractApiKey(req);
  if (!plaintext) return { ok: false, status: 401, error: "MISSING_API_KEY" };

  const prefix = extractPrefix(plaintext);
  if (!prefix) return { ok: false, status: 401, error: "INVALID_API_KEY_FORMAT" };

  const keyHash = hashApiKey(plaintext);

  const rows = (await sql`
    select
      id::text as id,
      owner_id::text as owner_id,
      key_hash
    from public.api_keys
    where prefix = ${prefix}
      and revoked_at is null
    limit 1
  `) as unknown as Array<{ id: string; owner_id: string; key_hash: string }>;

  const row = rows?.[0];
  if (!row) return { ok: false, status: 401, error: "INVALID_API_KEY" };
  const apiKeyId = normalizeUuidOrNull(row.id);
  const ownerId = normalizeUuidOrNull(row.owner_id);
  if (!apiKeyId || !ownerId) return { ok: false, status: 401, error: "INVALID_API_KEY" };

  if (!constantTimeEqual(row.key_hash, keyHash)) {
    return { ok: false, status: 401, error: "INVALID_API_KEY" };
  }

  // Best-effort last_used_at update
  try {
    await sql`
      update public.api_keys
      set last_used_at = now()
      where id = ${apiKeyId}::uuid
    `;
  } catch {
    // ignore
  }

  return { ok: true, ownerId, apiKeyId, prefix };
}
