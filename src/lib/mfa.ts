import crypto from "crypto";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/cryptoSecrets";
import { getInviteHashSecret, readEnvBoolean } from "@/lib/envConfig";
import type { Role } from "@/lib/authz";

const MFA_COOKIE = "cy_mfa";
const MFA_RECOVERY_COOKIE = "cy_mfa_recovery";
const MFA_COOKIE_TTL_SECONDS = 12 * 60 * 60;
const MFA_RECOVERY_COOKIE_TTL_SECONDS = 10 * 60;
const MFA_ISSUER = "CYANG Doclinks";
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 1;
const MFA_RECOVERY_CODES_COUNT = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_MAX_LEN = 320;
const CODE_MAX_LEN = 64;
const MAX_MFA_COOKIE_LEN = 2048;
const MAX_RECOVERY_COOKIE_LEN = 4096;
const MAX_RECOVERY_CODES_IN_COOKIE = 20;

type MfaRow = {
  user_id: string;
  totp_secret: string | null;
  pending_secret: string | null;
  recovery_code_hashes: string[] | null;
  recovery_codes_generated_at: string | null;
  enabled_at: string | null;
};

function normalizeUuidOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase().slice(0, EMAIL_MAX_LEN);
}

function normalizeCode(value: unknown): string {
  return String(value || "").trim().slice(0, CODE_MAX_LEN);
}

export function mfaEnforcementEnabled(): boolean {
  return readEnvBoolean("MFA_ENFORCE_ADMIN", false);
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
  const k = getInviteHashSecret() || "";
  if (!k) throw new Error("Missing NEXTAUTH_SECRET or VIEW_SALT for MFA cookie signing.");
  return k;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
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
  const payload = `${normalizeUuidOrNull(userId) || ""}|${normalizeEmail(email)}|${role}|${expUnix}`;
  const sig = sign(payload);
  return `${payload}|${sig}`;
}

function parseMfaCookie(value: string | null): { userId: string; email: string; role: Role; expUnix: number } | null {
  const raw = String(value || "").trim().slice(0, MAX_MFA_COOKIE_LEN);
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length !== 5) return null;
  const [userId, email, roleRaw, expRaw, sig] = parts;
  const payload = `${userId}|${email}|${roleRaw}|${expRaw}`;
  if (sign(payload) !== sig) return null;
  const expUnix = Number(expRaw);
  if (!Number.isFinite(expUnix) || expUnix <= Math.floor(Date.now() / 1000)) return null;
  const role = roleRaw === "owner" || roleRaw === "admin" || roleRaw === "viewer" ? roleRaw : null;
  const safeUserId = normalizeUuidOrNull(userId);
  const safeEmail = normalizeEmail(email);
  if (!role || !safeUserId || !safeEmail) return null;
  return { userId: safeUserId, email: safeEmail, role, expUnix };
}

function normalizeRecoveryCode(input: string): string {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(input: string): string {
  return crypto.createHmac("sha256", signingKey()).update(`mfa_recovery:${normalizeRecoveryCode(input)}`).digest("hex");
}

function randomRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

function recoveryCookieValue(codes: string[]): string {
  const expUnix = nowUnix() + MFA_RECOVERY_COOKIE_TTL_SECONDS;
  const normalizedCodes = codes
    .map((c) => String(c || "").trim().slice(0, CODE_MAX_LEN))
    .filter(Boolean)
    .slice(0, MAX_RECOVERY_CODES_IN_COOKIE);
  const payload = Buffer.from(JSON.stringify({ codes: normalizedCodes, expUnix }), "utf8").toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function parseRecoveryCookie(value: string | null): string[] | null {
  const raw = String(value || "").trim().slice(0, MAX_RECOVERY_COOKIE_LEN);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (sign(payload) !== sig) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { codes?: unknown; expUnix?: unknown };
    const expUnix = Number(json.expUnix);
    if (!Number.isFinite(expUnix) || expUnix <= nowUnix()) return null;
    if (!Array.isArray(json.codes)) return null;
    const codes = json.codes
      .slice(0, MAX_RECOVERY_CODES_IN_COOKIE)
      .map((v) => String(v || "").trim().slice(0, CODE_MAX_LEN))
      .filter(Boolean);
    return codes.length ? codes : null;
  } catch {
    return null;
  }
}

export async function issueMfaCookie(args: { userId: string; email: string; role: Role }): Promise<void> {
  const userId = normalizeUuidOrNull(args.userId);
  const email = normalizeEmail(args.email);
  if (!userId || !email) return;
  const jar = await cookies();
  const expUnix = nowUnix() + MFA_COOKIE_TTL_SECONDS;
  jar.set(MFA_COOKIE, mfaCookieValue(userId, email, args.role, expUnix), {
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

export async function issueRecoveryCodesDisplayCookie(codes: string[]): Promise<void> {
  const jar = await cookies();
  jar.set(MFA_RECOVERY_COOKIE, recoveryCookieValue(codes), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/mfa",
    maxAge: MFA_RECOVERY_COOKIE_TTL_SECONDS,
  });
}

export async function consumeRecoveryCodesDisplayCookie(): Promise<string[] | null> {
  const jar = await cookies();
  const parsed = parseRecoveryCookie(jar.get(MFA_RECOVERY_COOKIE)?.value ?? null);
  jar.set(MFA_RECOVERY_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/mfa",
    maxAge: 0,
  });
  return parsed;
}

export async function hasValidMfaCookie(args: { userId: string; email: string; role: Role }): Promise<boolean> {
  if (!roleRequiresMfa(args.role)) return true;
  const userId = normalizeUuidOrNull(args.userId);
  const email = normalizeEmail(args.email);
  if (!userId || !email) return false;
  const jar = await cookies();
  const parsed = parseMfaCookie(jar.get(MFA_COOKIE)?.value ?? null);
  if (!parsed) return false;
  return (
    parsed.userId === userId &&
    parsed.email === email &&
    parsed.role === args.role
  );
}

async function getMfaRow(userId: string): Promise<MfaRow | null> {
  const uid = normalizeUuidOrNull(userId);
  if (!uid) return null;
  const rows = (await sql`
    select
      user_id::text as user_id,
      totp_secret,
      pending_secret,
      coalesce(recovery_code_hashes, '[]'::jsonb) as recovery_code_hashes,
      recovery_codes_generated_at::text as recovery_codes_generated_at,
      enabled_at::text as enabled_at
    from public.user_mfa
    where user_id = ${uid}::uuid
    limit 1
  `) as unknown as MfaRow[];
  return rows?.[0] ?? null;
}

export async function getMfaStatus(userId: string): Promise<{
  available: boolean;
  enabled: boolean;
  pendingSecret: string | null;
  recoveryCodesCount: number;
}> {
  if (!(await mfaTableExists())) {
    return { available: false, enabled: false, pendingSecret: null, recoveryCodesCount: 0 };
  }
  const uid = normalizeUuidOrNull(userId);
  if (!uid) return { available: true, enabled: false, pendingSecret: null, recoveryCodesCount: 0 };
  const row = await getMfaRow(uid);
  if (!row) return { available: true, enabled: false, pendingSecret: null, recoveryCodesCount: 0 };
  let pendingSecret: string | null = null;
  if (row.pending_secret) {
    try {
      pendingSecret = decryptSecret(row.pending_secret);
    } catch {
      pendingSecret = null;
    }
  }
  return {
    available: true,
    enabled: Boolean(row.totp_secret && row.enabled_at),
    pendingSecret,
    recoveryCodesCount: Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes.length : 0,
  };
}

export async function getOrCreatePendingMfaSecret(userId: string): Promise<string> {
  if (!(await mfaTableExists())) throw new Error("MFA_TABLE_MISSING");
  const uid = normalizeUuidOrNull(userId);
  if (!uid) throw new Error("BAD_REQUEST");
  const existing = await getMfaRow(uid);
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
      where user_id = ${uid}::uuid
    `;
  } else {
    await sql`
      insert into public.user_mfa (user_id, pending_secret, created_at, updated_at)
      values (${uid}::uuid, ${encrypted}, now(), now())
      on conflict (user_id)
      do update set pending_secret = excluded.pending_secret, updated_at = now()
    `;
  }
  return secret;
}

export function totpUri(secretBase32: string, email: string): string {
  const label = encodeURIComponent(`${MFA_ISSUER}:${normalizeEmail(email)}`);
  const issuer = encodeURIComponent(MFA_ISSUER);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secretBase32)}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[] | null> {
  if (!(await mfaTableExists())) return null;
  const uid = normalizeUuidOrNull(userId);
  if (!uid) return null;
  const row = await getMfaRow(uid);
  if (!row?.totp_secret || !row.enabled_at) return null;
  const codes: string[] = [];
  for (let i = 0; i < MFA_RECOVERY_CODES_COUNT; i += 1) {
    codes.push(randomRecoveryCode());
  }
  const hashes = codes.map((c) => hashRecoveryCode(c));
  await sql`
    update public.user_mfa
    set
      recovery_code_hashes = ${JSON.stringify(hashes)}::jsonb,
      recovery_codes_generated_at = now(),
      updated_at = now()
    where user_id = ${uid}::uuid
  `;
  return codes;
}

export async function enableMfa(args: { userId: string; code: string }): Promise<boolean> {
  if (!(await mfaTableExists())) return false;
  const userId = normalizeUuidOrNull(args.userId);
  if (!userId) return false;
  const code = normalizeCode(args.code);
  const row = await getMfaRow(userId);
  if (!row?.pending_secret) return false;
  let pendingSecret: string;
  try {
    pendingSecret = decryptSecret(row.pending_secret);
  } catch {
    return false;
  }
  if (!verifyTotp(pendingSecret, code)) return false;
  const encrypted = encryptSecret(pendingSecret);
  await sql`
    insert into public.user_mfa (user_id, totp_secret, pending_secret, enabled_at, created_at, updated_at)
    values (${userId}::uuid, ${encrypted}, null, now(), now(), now())
    on conflict (user_id)
    do update set
      totp_secret = excluded.totp_secret,
      pending_secret = null,
      enabled_at = now(),
      updated_at = now()
  `;
  await regenerateRecoveryCodes(userId);
  return true;
}

export async function verifyMfaCode(args: { userId: string; code: string }): Promise<boolean> {
  if (!(await mfaTableExists())) return false;
  const userId = normalizeUuidOrNull(args.userId);
  if (!userId) return false;
  const code = normalizeCode(args.code);
  const row = await getMfaRow(userId);
  if (!row?.totp_secret || !row.enabled_at) return false;
  let secret: string;
  try {
    secret = decryptSecret(row.totp_secret);
  } catch {
    return false;
  }
  if (verifyTotp(secret, code)) {
    await sql`
      update public.user_mfa
      set last_verified_at = now(), updated_at = now()
      where user_id = ${userId}::uuid
    `;
    return true;
  }

  const codeHash = hashRecoveryCode(code);
  const hashes = Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes : [];
  const index = hashes.findIndex((h) => h === codeHash);
  if (index < 0) return false;
  const remaining = hashes.filter((_, i) => i !== index);
  await sql`
    update public.user_mfa
    set
      recovery_code_hashes = ${JSON.stringify(remaining)}::jsonb,
      last_verified_at = now(),
      updated_at = now()
    where user_id = ${userId}::uuid
  `;
  return true;
}
