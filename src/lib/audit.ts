// src/lib/audit.ts
// Centralized audit + device-trust helpers.
//
// NOTE: This module is intentionally defensive.
// - All DB writes are best-effort (tables may not exist yet).
// - Callers already wrap in try/catch; we also guard internally.

import crypto from "crypto";
import { sql } from "@/lib/db";

export function getClientIpFromHeaders(h: Headers): string {
  // Vercel/Next generally forwards client IP via x-forwarded-for.
  const xff = (h.get("x-forwarded-for") || "").trim();
  if (xff) return xff.split(",")[0]?.trim() || "";

  // Fallbacks that sometimes appear depending on infra.
  const realIp = (h.get("x-real-ip") || "").trim();
  if (realIp) return realIp;

  return "";
}

export function getUserAgentFromHeaders(h: Headers): string {
  return (h.get("user-agent") || "").trim();
}

export function deviceHashFrom(ip: string, userAgent: string): string | null {
  const salt = (process.env.DEVICE_TRUST_SALT || process.env.VIEW_SALT || "").trim();
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
  const { docId, deviceHash } = args;
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
  const { docId, deviceHash, trustedUntilIso } = args;
  if (!docId || !deviceHash || !trustedUntilIso) return;

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
   * Back-compat: older callers pass shareId. If you also have a share/token string,
   * prefer passing it via `token` (optional) so it lands in doc_access_log.token.
   */
  shareId: string | null;
  emailUsed: string | null;
  /** Optional share token (preferred for doc_access_log.token). */
  token?: string | null;
  ip: string;
  userAgent: string;
}): Promise<void> {
  const { docId, alias, shareId, emailUsed, token, ip, userAgent } = args;
  if (!docId) return;

  // Keep storing hashed IP in doc_audit (privacy-friendly).
  const ipHash = (() => {
    const salt = (process.env.VIEW_SALT || "").trim();
    if (!salt || !ip) return null;
    return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
  })();

  // 1) Primary: doc_audit (richer event model)
  try {
    await sql`
      insert into public.doc_audit
        (doc_id, alias, share_id, email_used, ip_hash, user_agent)
      values
        (${docId}::uuid, ${alias}, ${shareId}, ${emailUsed}, ${ipHash}, ${userAgent})
    `;
  } catch {
    // best-effort
  }

  // 2) Secondary: doc_access_log (simple access trail)
  // Your production schema (per /admin/db-debug) is:
  //   id, doc_id, alias, token, ip, user_agent, created_at
  // So we write only those columns.
  try {
    const tok = (token ?? shareId) || null;
    await sql`
      insert into public.doc_access_log
        (doc_id, alias, token, ip, user_agent)
      values
        (${docId}::uuid, ${alias}, ${tok}, ${ip || null}, ${userAgent || null})
    `;
  } catch {
    // best-effort
  }
}
