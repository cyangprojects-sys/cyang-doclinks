import crypto from "crypto";

let cachedSecret: string | null = null;
const MIN_APP_SECRET_LEN = 16;
const MAX_TOKEN_BYTES = 1024;
const MAX_SIGNED_TOKEN_LEN = 16 * 1024;
const MAX_SIGNED_PAYLOAD_BYTES = 8 * 1024;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const secret = (process.env.APP_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing APP_SECRET");
  }
  if (secret.length < MIN_APP_SECRET_LEN || /[\r\n\0]/.test(secret)) {
    throw new Error("APP_SECRET must be at least 16 chars and contain no control chars");
  }

  cachedSecret = secret;
  return secret;
}

export function randomToken(bytes = 32): string {
  const sizeRaw = Number(bytes);
  const size = Number.isFinite(sizeRaw) ? Math.floor(sizeRaw) : 32;
  const bounded = Math.max(16, Math.min(MAX_TOKEN_BYTES, size));
  return crypto.randomBytes(bounded).toString("base64url");
}

export function hmacSha256Hex(input: string): string {
  const msg = String(input ?? "");
  return crypto.createHmac("sha256", getSecret()).update(msg).digest("hex");
}

export function signPayload(payload: object): string {
  const json = JSON.stringify(payload);
  const raw = Buffer.from(json, "utf8");
  if (raw.length === 0 || raw.length > MAX_SIGNED_PAYLOAD_BYTES) {
    throw new Error("INVALID_PAYLOAD_SIZE");
  }
  const body = raw.toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedPayload<T>(signed: string): T | null {
  const token = String(signed ?? "");
  if (!token || token.length > MAX_SIGNED_TOKEN_LEN || token !== token.trim() || /[\r\n\0]/.test(token)) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  if (!BASE64URL_RE.test(body) || !BASE64URL_RE.test(sig)) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");

  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
