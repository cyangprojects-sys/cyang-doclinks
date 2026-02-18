// src/lib/shareAuth.ts
//
// Production-grade share auth helpers:
// - Signed, httpOnly device-trust cookie (8 hours)
// - Signed email-proof tokens for email-bound shares

import crypto from "crypto";

const DEVICE_COOKIE_NAME = "cyang_trusted_device";

// Device trust duration
const EIGHT_HOURS_SEC = 8 * 60 * 60;

// Email-proof links should be short-lived.
const EMAIL_PROOF_TTL_SEC = 15 * 60;

function envSecret() {
  // Prefer a dedicated secret, fallback to VIEW_SALT, then NEXTAUTH_SECRET
  return (
    process.env.SHARE_COOKIE_SECRET ||
    process.env.VIEW_SALT ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function sign(data: string) {
  const secret = envSecret();
  if (!secret) {
    throw new Error(
      "Missing SHARE_COOKIE_SECRET (or VIEW_SALT/NEXTAUTH_SECRET)."
    );
  }
  return b64url(crypto.createHmac("sha256", secret).update(data).digest());
}

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function shareUnlockCookieName() {
  return DEVICE_COOKIE_NAME;
}

/**
 * Create a signed cookie value binding a device id to a specific share token.
 * Format: token.deviceId.exp.sig
 */
export function makeDeviceTrustCookieValue(opts: {
  token: string;
  deviceId: string;
  nowMs?: number;
}) {
  const nowMs = opts.nowMs ?? Date.now();
  const exp = Math.floor(nowMs / 1000) + EIGHT_HOURS_SEC; // unix seconds
  const payload = `${opts.token}.${opts.deviceId}.${exp}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyDeviceTrustCookieValue(value: string | undefined | null) {
  if (!value) return { ok: false as const, reason: "missing" as const };
  const parts = value.split(".");
  if (parts.length !== 4) return { ok: false as const, reason: "format" as const };

  const [token, deviceId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!token || !deviceId || !Number.isFinite(exp)) {
    return { ok: false as const, reason: "format" as const };
  }
  if (Math.floor(Date.now() / 1000) > exp) {
    return { ok: false as const, reason: "expired" as const };
  }

  const payload = `${token}.${deviceId}.${exp}`;
  const expected = sign(payload);

  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false as const, reason: "sig" as const };
  if (!crypto.timingSafeEqual(a, b))
    return { ok: false as const, reason: "sig" as const };

  return {
    ok: true as const,
    token,
    deviceId,
    deviceHash: sha256Hex(deviceId),
    exp,
  };
}

export function unlockCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    maxAge: EIGHT_HOURS_SEC,
  };
}

/**
 * Signed email-proof token for email-bound shares.
 * Format: token.emailB64.exp.sig
 */
export function makeEmailProofToken(opts: {
  token: string;
  email: string;
  nowMs?: number;
}) {
  const nowMs = opts.nowMs ?? Date.now();
  const exp = Math.floor(nowMs / 1000) + EMAIL_PROOF_TTL_SEC;
  const emailB64 = Buffer.from(opts.email, "utf8").toString("base64url");
  const payload = `${opts.token}.${emailB64}.${exp}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyEmailProofToken(value: string | undefined | null) {
  if (!value) return { ok: false as const, reason: "missing" as const };
  const parts = value.split(".");
  if (parts.length !== 4) return { ok: false as const, reason: "format" as const };

  const [token, emailB64, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!token || !emailB64 || !Number.isFinite(exp)) {
    return { ok: false as const, reason: "format" as const };
  }
  if (Math.floor(Date.now() / 1000) > exp) {
    return { ok: false as const, reason: "expired" as const };
  }

  const payload = `${token}.${emailB64}.${exp}`;
  const expected = sign(payload);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false as const, reason: "sig" as const };
  if (!crypto.timingSafeEqual(a, b))
    return { ok: false as const, reason: "sig" as const };

  let email = "";
  try {
    email = Buffer.from(emailB64, "base64url").toString("utf8");
  } catch {
    return { ok: false as const, reason: "format" as const };
  }

  return { ok: true as const, token, email, exp };
}
