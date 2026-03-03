import crypto from "crypto";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/cryptoSecrets";
import type { Role } from "@/lib/authz";

const MFA_COOKIE = "cy_mfa";
const MFA_COOKIE_TTL_SECONDS = 12 * 60 * 60;
const MFA_ISSUER = "CYANG Doclinks";
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 1;

type MfaRow = {
  user_id: string;
  totp_secret: string | null;
  pending_secret: string | null;
  enabled_at: string | null;
};

function envBool(name: string, fallback = false): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export function mfaEnforcementEnabled(): boolean {
  return envBool("MFA_ENFORCE_ADMIN", false);
}

export function roleRequiresMfa(role: Role): boolean {
  if (!mfaEnforcementEnabled()) return false;
  return role === "admin" || role === "owner";
}

let mfaTableExistsCache: boolean | null = null;
export async function mfaTableExists(): Promise<boolean> {
  if (mfaTableExistsCache != null) return mfaTableExistsCache;
  try {
    const rows = (await sql`
      select to_regclass('public.user_mfa')::text as reg
    `) as unknown as Array<{ reg: string | null }>;
    mfaTableExistsCache = Boolean(rows?.[0]?.reg);
    return mfaTableExistsCache;
  } catch {
    mfaTableExistsCache = false;
    return false;
  }
}

function signingKey(): string {
  const k = String(process.env.NEXTAUTH_SECRET || process.env.VIEW_SALT || "").trim();
  if (!k) throw new Error("Missing NEXTAUTH_SECRET or VIEW_SALT for MFA cookie signing.");
  return k;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function randomBase32Secret(bytes = 20): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const input = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of input) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

function decodeBase32(secret: string): Buffer {
  const clean = String(secret || "").replace(/[\s=-]/g, "").toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secretBase32: string, nowMs: number): string {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

function verifyTotp(secretBase32: string, codeRaw: string): boolean {
  const code = String(codeRaw || "").replace(/\D/g, "");
  if (code.length !== 6) return false;
  const now = Date.now();
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i += 1) {
    const at = now + i * TOTP_STEP_SECONDS * 1000;
    if (totpCode(secretBase32, at) === code) return true;
  }
  return false;
}

function mfaCookieValue(userId: string, email: string, role: Role, expUnix: number): string {
  const payload = `${userId}|${email}|${role}|${expUnix}`;
  const sig = sign(payload);
  return `${payload}|${sig}`;
}

function parseMfaCookie(value: string | null): { userId: string; email: string; role: Role; expUnix: number } | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length !== 5) return null;
  const [userId, email, roleRaw, expRaw, sig] = parts;
  const payload = `${userId}|${email}|${roleRaw}|${expRaw}`;
  if (sign(payload) !== sig) return null;
  const expUnix = Number(expRaw);
  if (!Number.isFinite(expUnix) || expUnix <= Math.floor(Date.now() / 1000)) return null;
  const role = roleRaw === "owner" || roleRaw === "admin" || roleRaw === "viewer" ? roleRaw : null;
  if (!role) return null;
  return { userId, email, role, expUnix };
}

export async function issueMfaCookie(args: { userId: string; email: string; role: Role }): Promise<void> {
  const jar = await cookies();
  const expUnix = Math.floor(Date.now() / 1000) + MFA_COOKIE_TTL_SECONDS;
  jar.set(MFA_COOKIE, mfaCookieValue(args.userId, args.email, args.role, expUnix), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MFA_COOKIE_TTL_SECONDS,
  });
}

export async function clearMfaCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(MFA_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function hasValidMfaCookie(args: { userId: string; email: string; role: Role }): Promise<boolean> {
  if (!roleRequiresMfa(args.role)) return true;
  const jar = await cookies();
  const parsed = parseMfaCookie(jar.get(MFA_COOKIE)?.value ?? null);
  if (!parsed) return false;
  return (
    parsed.userId === args.userId &&
    parsed.email === args.email &&
    parsed.role === args.role
  );
}

async function getMfaRow(userId: string): Promise<MfaRow | null> {
  const rows = (await sql`
    select
      user_id::text as user_id,
      totp_secret,
      pending_secret,
      enabled_at::text as enabled_at
    from public.user_mfa
    where user_id = ${userId}::uuid
    limit 1
  `) as unknown as MfaRow[];
  return rows?.[0] ?? null;
}

export async function getMfaStatus(userId: string): Promise<{
  available: boolean;
  enabled: boolean;
  pendingSecret: string | null;
}> {
  if (!(await mfaTableExists())) {
    return { available: false, enabled: false, pendingSecret: null };
  }
  const row = await getMfaRow(userId);
  if (!row) return { available: true, enabled: false, pendingSecret: null };
  let pendingSecret: string | null = null;
  if (row.pending_secret) {
    try {
      pendingSecret = decryptSecret(row.pending_secret);
    } catch {
      pendingSecret = null;
    }
  }
  return { available: true, enabled: Boolean(row.totp_secret && row.enabled_at), pendingSecret };
}

export async function getOrCreatePendingMfaSecret(userId: string): Promise<string> {
  if (!(await mfaTableExists())) throw new Error("MFA_TABLE_MISSING");
  const existing = await getMfaRow(userId);
  if (existing?.pending_secret) {
    try {
      return decryptSecret(existing.pending_secret);
    } catch {
      // regenerate below
    }
  }
  const secret = randomBase32Secret();
  const encrypted = encryptSecret(secret);
  if (existing) {
    await sql`
      update public.user_mfa
      set pending_secret = ${encrypted}, updated_at = now()
      where user_id = ${userId}::uuid
    `;
  } else {
    await sql`
      insert into public.user_mfa (user_id, pending_secret, created_at, updated_at)
      values (${userId}::uuid, ${encrypted}, now(), now())
      on conflict (user_id)
      do update set pending_secret = excluded.pending_secret, updated_at = now()
    `;
  }
  return secret;
}

export function totpUri(secretBase32: string, email: string): string {
  const label = encodeURIComponent(`${MFA_ISSUER}:${email}`);
  const issuer = encodeURIComponent(MFA_ISSUER);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secretBase32)}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

export async function enableMfa(args: { userId: string; code: string }): Promise<boolean> {
  if (!(await mfaTableExists())) return false;
  const row = await getMfaRow(args.userId);
  if (!row?.pending_secret) return false;
  let pendingSecret: string;
  try {
    pendingSecret = decryptSecret(row.pending_secret);
  } catch {
    return false;
  }
  if (!verifyTotp(pendingSecret, args.code)) return false;
  const encrypted = encryptSecret(pendingSecret);
  await sql`
    insert into public.user_mfa (user_id, totp_secret, pending_secret, enabled_at, created_at, updated_at)
    values (${args.userId}::uuid, ${encrypted}, null, now(), now(), now())
    on conflict (user_id)
    do update set
      totp_secret = excluded.totp_secret,
      pending_secret = null,
      enabled_at = now(),
      updated_at = now()
  `;
  return true;
}

export async function verifyMfaCode(args: { userId: string; code: string }): Promise<boolean> {
  if (!(await mfaTableExists())) return false;
  const row = await getMfaRow(args.userId);
  if (!row?.totp_secret || !row.enabled_at) return false;
  let secret: string;
  try {
    secret = decryptSecret(row.totp_secret);
  } catch {
    return false;
  }
  if (!verifyTotp(secret, args.code)) return false;
  await sql`
    update public.user_mfa
    set last_verified_at = now(), updated_at = now()
    where user_id = ${args.userId}::uuid
  `;
  return true;
}

