import crypto from "crypto";

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const MAX_PASSWORD_LEN = 4096;
const MAX_STORED_HASH_LEN = 512;
const PASSWORD_CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/u;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function passwordCharLength(password: string): number {
  return Array.from(String(password || "")).length;
}

export function hasUnsupportedPasswordChars(password: string): boolean {
  return PASSWORD_CONTROL_CHAR_RE.test(String(password || ""));
}

export function isSafePasswordCandidate(password: string, maxLen = MAX_PASSWORD_LEN): boolean {
  const raw = String(password || "");
  return Boolean(raw) && passwordCharLength(raw) <= maxLen && !hasUnsupportedPasswordChars(raw);
}

export function hashPassword(password: string): string {
  const raw = String(password || "");
  if (!isSafePasswordCandidate(raw)) {
    throw new Error("INVALID_PASSWORD");
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(raw, salt, SCRYPT_KEYLEN);
  return `scrypt$${b64url(salt)}$${b64url(derived)}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const rawPassword = String(password || "");
  if (!isSafePasswordCandidate(rawPassword)) return false;
  const rawStored = String(storedHash || "").trim();
  if (!rawStored || rawStored.length > MAX_STORED_HASH_LEN || /[\r\n\0]/.test(rawStored)) return false;

  const parts = rawStored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  try {
    const salt = fromB64url(parts[1]);
    const expected = fromB64url(parts[2]);
    if (salt.length !== SALT_BYTES) return false;
    if (expected.length !== SCRYPT_KEYLEN) return false;
    const actual = crypto.scryptSync(rawPassword, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
