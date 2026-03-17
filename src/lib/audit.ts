// src/lib/audit.ts
// Centralized audit + device-trust helpers.
//
// NOTE: This module is intentionally defensive.
// - All DB writes are best-effort (tables may not exist yet).
// - Callers already wrap in try/catch; we also guard internally.

import crypto from "crypto";
import { sql } from "@/lib/db";
import { getHashingSalt } from "@/lib/envConfig";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { getTrustedClientIpFromHeaders } from "@/lib/clientIp";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_HASH_RE = /^[0-9a-f]{40}$/i;
const MAX_ALIAS_LEN = 128;
const MAX_TOKEN_LEN = 256;
const MAX_EMAIL_LEN = 320;
const MAX_IP_LEN = 64;
const MAX_USER_AGENT_LEN = 512;

function normalizeUuidOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function normalizeTextOrNull(value: unknown, maxLen: number): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function normalizeDeviceHash(value: unknown): string | null {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return null;
  return DEVICE_HASH_RE.test(s) ? s : null;
}

export function getClientIpFromHeaders(h: Headers): string {
  return normalizeTextOrNull(getTrustedClientIpFromHeaders(h), MAX_IP_LEN) || "";
}

export function getUserAgentFromHeaders(h: Headers): string {
  return normalizeTextOrNull(h.get("user-agent"), MAX_USER_AGENT_LEN) || "";
}

export function deviceHashFrom(ip: string, userAgent: string): string | null {
  const salt = getHashingSalt("DEVICE_TRUST_SALT", ["VIEW_SALT"]) || "";
  if (!salt) return null;

  const payload = `${(ip || "").trim()}|${(userAgent || "").trim()}`;
  if (payload === "|") return null;

  // Short, fixed-length hash for DB storage.
  return crypto.createHmac("sha256", salt).update(payload).digest("hex").slice(0, 40);
}

export async function isDeviceTrustedForDoc(args: {
  docId: string;
  deviceHash: string;
}): Promise<boolean> {
  const docId = normalizeUuidOrNull(args.docId);
  const deviceHash = normalizeDeviceHash(args.deviceHash);
  if (!docId || !deviceHash) return false;

  try {
    const rows = (await sql`
      select 1
      from public.trusted_devices
      where doc_id = ${docId}::uuid
        and device_hash = ${deviceHash}
        and trusted_until > now()
      limit 1
    `) as unknown as Array<{ "?column?": number }>;

    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function trustDeviceForDoc(args: {
  docId: string;
  deviceHash: string;
  trustedUntilIso: string;
}): Promise<void> {
  const docId = normalizeUuidOrNull(args.docId);
  const deviceHash = normalizeDeviceHash(args.deviceHash);
  const trustedUntilRaw = normalizeTextOrNull(args.trustedUntilIso, 64);
  if (!docId || !deviceHash || !trustedUntilRaw) return;
  const parsedTrustedUntil = Date.parse(trustedUntilRaw);
  if (!Number.isFinite(parsedTrustedUntil)) return;
  const trustedUntilIso = new Date(parsedTrustedUntil).toISOString();

  try {
    await sql`
      insert into public.trusted_devices (doc_id, device_hash, trusted_until)
      values (${docId}::uuid, ${deviceHash}, ${trustedUntilIso}::timestamptz)
      on conflict (doc_id, device_hash)
      do update set trusted_until = excluded.trusted_until
    `;
  } catch {
    // best-effort
  }
}

export async function logDocAccess(args: {
  docId: string;
  alias: string | null;
  /**
   * Legacy field used by older callers. If `token` is not provided, we will
   * fall back to using `shareId` as `token` for doc_access_log.
   */
  shareId: string | null;
  /** Optional (preferred) share token / access token */
  token?: string | null;
  /** Optional (legacy) email used for access */
  emailUsed?: string | null;
  ip: string;
  userAgent: string;
}): Promise<void> {
  const docId = normalizeUuidOrNull(args.docId);
  if (!docId) return;
  const alias = normalizeTextOrNull(args.alias, MAX_ALIAS_LEN);
  const shareId = normalizeTextOrNull(args.shareId, MAX_TOKEN_LEN);
  const token = normalizeTextOrNull(args.token, MAX_TOKEN_LEN);
  const emailUsed = normalizeTextOrNull(args.emailUsed, MAX_EMAIL_LEN);
  const ip = normalizeTextOrNull(args.ip, MAX_IP_LEN);
  const userAgent = normalizeTextOrNull(args.userAgent, MAX_USER_AGENT_LEN) || "";

  // Hash for doc_audit (privacy-friendly) if VIEW_SALT is configured.
  const ipHash = (() => {
    const salt = (process.env.VIEW_SALT || "").trim();
    if (!salt || !ip) return null;
    return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
  })();

  // 1) Best-effort write to doc_audit (if your table matches these columns).
  try {
    await sql`
      insert into public.doc_audit
        (doc_id, alias, share_id, email_used, ip_hash, user_agent)
      values
        (${docId}::uuid, ${alias}, ${shareId}, ${emailUsed ?? null}, ${ipHash}, ${userAgent})
    `;
  } catch {
    // best-effort
  }

  // 2) Best-effort write to doc_access_log using the schema confirmed in prod:
  // columns: id, doc_id, alias, token, ip, user_agent, created_at (default)
  // NOTE: Your prod table uses `created_at` (not accessed_at).
  const tokenToStore = (token ?? null) || (shareId ?? null);
  try {
    await sql`
      insert into public.doc_access_log
        (doc_id, alias, token, ip, user_agent)
      values
        (${docId}::uuid, ${alias}, ${tokenToStore}, ${ip || null}, ${userAgent})
    `;
  } catch {
    // best-effort
  }

  const uaHash = userAgent
    ? crypto.createHash("sha256").update(userAgent).digest("hex").slice(0, 32)
    : null;
  await appendImmutableAudit({
    streamKey: `doc:${docId}`,
    action: "doc.access",
    docId,
    subjectId: tokenToStore,
    ipHash: ipHash ?? null,
    payload: {
      alias: alias ?? null,
      tokenPresent: Boolean(tokenToStore),
      emailPresent: Boolean(emailUsed),
      uaHash,
    },
  });
}
