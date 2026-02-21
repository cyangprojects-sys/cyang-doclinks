// src/lib/apiAuth.ts
// API key authentication for programmatic endpoints.

import { sql } from "@/lib/db";
import { constantTimeEqual, hashApiKey } from "@/lib/apiKeys";

export type ApiAuthResult =
  | { ok: true; ownerId: string; apiKeyId: string; prefix: string }
  | { ok: false; status: number; error: string };

function extractApiKey(req: Request): string | null {
  const h = req.headers;

  const x = (h.get("x-api-key") || "").trim();
  if (x) return x;

  const auth = (h.get("authorization") || "").trim();
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
  if (!row) return { ok: false, status: 401, error: "API_KEY_NOT_FOUND" };

  if (!constantTimeEqual(row.key_hash, keyHash)) {
    return { ok: false, status: 401, error: "API_KEY_MISMATCH" };
  }

  // Best-effort last_used_at update
  try {
    await sql`
      update public.api_keys
      set last_used_at = now()
      where id = ${row.id}::uuid
    `;
  } catch {
    // ignore
  }

  return { ok: true, ownerId: row.owner_id, apiKeyId: row.id, prefix };
}
