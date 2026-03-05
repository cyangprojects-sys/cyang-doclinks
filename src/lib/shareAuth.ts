// src/lib/shareAuth.ts
import crypto from "crypto";

/**
 * Cookie used to represent "this device has unlocked this share"
 * (either by password or email-proof) for ~8 hours.
 */
const SHARE_UNLOCK_COOKIE = "cyang_share_unlock";

/**
 * Cookie used to represent "this device is trusted for this share"
 * (device trust / forwarding-resistance) for ~8 hours.
 */
const DEVICE_TRUST_COOKIE = "cyang_trusted_device";

const EIGHT_HOURS_SEC = 8 * 60 * 60;
const MAX_SECRET_LEN = 512;
const MAX_COOKIE_VALUE_LEN = 2048;
const MAX_COMPONENT_LEN = 160;
const MAX_EMAIL_LEN = 320;
const MAX_EMAIL_PROOF_TTL_SEC = 24 * 60 * 60;
const MIN_EMAIL_PROOF_TTL_SEC = 60;
const COMPONENT_RE = /^[A-Za-z0-9_-]+$/;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function envSecret() {
    // Prefer a dedicated secret, fallback to VIEW_SALT, then NEXTAUTH_SECRET.
    const candidates = [process.env.SHARE_COOKIE_SECRET, process.env.VIEW_SALT, process.env.NEXTAUTH_SECRET];
    for (const candidate of candidates) {
        const raw = String(candidate || "").trim();
        if (!raw || raw.length > MAX_SECRET_LEN || /[\r\n\0]/.test(raw)) continue;
        return raw;
    }
    return "";
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

function constantTimeEq(aStr: string, bStr: string) {
    const a = Buffer.from(aStr);
    const b = Buffer.from(bStr);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function normalizeComponent(value: string, fieldName: string): string {
    const raw = String(value || "").trim();
    if (!raw || raw.length > MAX_COMPONENT_LEN || !COMPONENT_RE.test(raw)) {
        throw new Error(`INVALID_${fieldName}`);
    }
    return raw;
}

function normalizeEmail(value: string): string {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw || raw.length > MAX_EMAIL_LEN) throw new Error("INVALID_EMAIL");
    if (/[\r\n\0]/.test(raw)) throw new Error("INVALID_EMAIL");
    if (!BASIC_EMAIL_RE.test(raw)) throw new Error("INVALID_EMAIL");
    return raw;
}

function safeNowMs(nowMs: number): number {
    return Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();
}

function safeExpiry(nowMs: number, ttlSec: number): number {
    const ttl = Number.isFinite(ttlSec) ? Math.floor(ttlSec) : 10 * 60;
    const boundedTtl = Math.max(MIN_EMAIL_PROOF_TTL_SEC, Math.min(MAX_EMAIL_PROOF_TTL_SEC, ttl));
    return Math.floor(safeNowMs(nowMs) / 1000) + boundedTtl;
}

/** ========= SHARE UNLOCK COOKIE ========= */

export function shareUnlockCookieName() {
    return SHARE_UNLOCK_COOKIE;
}

export function makeUnlockCookieValue(token: string, nowMs = Date.now()) {
    const tokenNorm = normalizeComponent(token, "TOKEN");
    const exp = Math.floor(safeNowMs(nowMs) / 1000) + EIGHT_HOURS_SEC; // unix seconds
    const payload = `${tokenNorm}.${exp}`;
    const sig = sign(payload);
    return `${payload}.${sig}`;
}

export function verifyUnlockCookieValue(value: string | undefined | null) {
    const rawInput = String(value || "");
    const raw = rawInput.trim();
    if (!raw) return { ok: false as const, reason: "missing" as const };
    if (raw.length > MAX_COOKIE_VALUE_LEN || /[\r\n\0]/.test(rawInput)) return { ok: false as const, reason: "format" as const };

    const parts = raw.split(".");
    if (parts.length !== 3) return { ok: false as const, reason: "format" as const };

    const [token, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!token || !Number.isFinite(exp) || !Number.isInteger(exp)) return { ok: false as const, reason: "format" as const };
    if (token.length > MAX_COMPONENT_LEN || !COMPONENT_RE.test(token)) return { ok: false as const, reason: "format" as const };
    if (Math.floor(Date.now() / 1000) > exp) return { ok: false as const, reason: "expired" as const };

    const payload = `${token}.${exp}`;
    const expected = sign(payload);
    if (!constantTimeEq(sig, expected)) return { ok: false as const, reason: "sig" as const };

    return { ok: true as const, token, exp };
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

/** ========= DEVICE TRUST COOKIE ========= */

export function deviceTrustCookieName() {
    return DEVICE_TRUST_COOKIE;
}

/**
 * Creates a signed cookie value that binds:
 * - shareId
 * - deviceHash (hash of stable-ish fingerprint)
 * - expiry
 */
export function makeDeviceTrustCookieValue(
    shareId: string,
    deviceHash: string,
    nowMs = Date.now()
) {
    const shareIdNorm = normalizeComponent(shareId, "SHARE_ID");
    const deviceHashNorm = normalizeComponent(deviceHash, "DEVICE_HASH");
    const exp = Math.floor(safeNowMs(nowMs) / 1000) + EIGHT_HOURS_SEC;
    const payload = `v1.${shareIdNorm}.${deviceHashNorm}.${exp}`;
    const sig = sign(payload);
    return `${payload}.${sig}`;
}

export function verifyDeviceTrustCookieValue(value: string | undefined | null) {
    const rawInput = String(value || "");
    const raw = rawInput.trim();
    if (!raw) return { ok: false as const, reason: "missing" as const };
    if (raw.length > MAX_COOKIE_VALUE_LEN || /[\r\n\0]/.test(rawInput)) return { ok: false as const, reason: "format" as const };

    const parts = raw.split(".");
    // v1.shareId.deviceHash.exp.sig => 5 parts
    if (parts.length !== 5) return { ok: false as const, reason: "format" as const };

    const [v, shareId, deviceHash, expStr, sig] = parts;
    if (v !== "v1") return { ok: false as const, reason: "format" as const };

    const exp = Number(expStr);
    if (!shareId || !deviceHash || !Number.isFinite(exp) || !Number.isInteger(exp)) {
        return { ok: false as const, reason: "format" as const };
    }
    if (shareId.length > MAX_COMPONENT_LEN || !COMPONENT_RE.test(shareId)) return { ok: false as const, reason: "format" as const };
    if (deviceHash.length > MAX_COMPONENT_LEN || !COMPONENT_RE.test(deviceHash)) return { ok: false as const, reason: "format" as const };
    if (Math.floor(Date.now() / 1000) > exp) {
        return { ok: false as const, reason: "expired" as const };
    }

    const payload = `v1.${shareId}.${deviceHash}.${exp}`;
    const expected = sign(payload);
    if (!constantTimeEq(sig, expected)) return { ok: false as const, reason: "sig" as const };

    return { ok: true as const, shareId, deviceHash, exp };
}

/** ========= EMAIL PROOF TOKEN ========= */

/**
 * Short-lived signed proof for email-bound shares.
 * You generate it on server after verifying allowed_email,
 * and consume it to set trusted device cookie.
 */
export function makeEmailProofToken(args: {
    shareId: string;
    token: string; // share token
    email: string;
    nowMs?: number;
    ttlSec?: number; // default 10 minutes
}) {
    const shareId = normalizeComponent(args.shareId, "SHARE_ID");
    const token = normalizeComponent(args.token, "TOKEN");
    const nowMs = safeNowMs(args.nowMs ?? Date.now());
    const exp = safeExpiry(nowMs, args.ttlSec ?? 10 * 60);

    const emailNorm = normalizeEmail(args.email);
    const payload = `v1.${shareId}.${token}.${emailNorm}.${exp}`;
    const sig = sign(payload);
    return `${payload}.${sig}`;
}

export function verifyEmailProofToken(value: string | undefined | null) {
    const rawInput = String(value || "");
    const raw = rawInput.trim();
    if (!raw) return { ok: false as const, reason: "missing" as const };
    if (raw.length > MAX_COOKIE_VALUE_LEN || /[\r\n\0]/.test(rawInput)) return { ok: false as const, reason: "format" as const };

    const parts = raw.split(".");
    // Format: v1.shareId.token.email.exp.sig
    // Email may contain dots, so parse from both ends instead of fixed part count.
    if (parts.length < 6) return { ok: false as const, reason: "format" as const };

    const v = parts[0] || "";
    const shareId = parts[1] || "";
    const token = parts[2] || "";
    const sig = parts[parts.length - 1] || "";
    const expStr = parts[parts.length - 2] || "";
    const email = parts.slice(3, parts.length - 2).join(".");
    if (v !== "v1") return { ok: false as const, reason: "format" as const };

    const exp = Number(expStr);
    if (!shareId || !token || !email || !Number.isFinite(exp) || !Number.isInteger(exp)) {
        return { ok: false as const, reason: "format" as const };
    }
    if (shareId.length > MAX_COMPONENT_LEN || !COMPONENT_RE.test(shareId)) return { ok: false as const, reason: "format" as const };
    if (token.length > MAX_COMPONENT_LEN || !COMPONENT_RE.test(token)) return { ok: false as const, reason: "format" as const };
    if (email.length > MAX_EMAIL_LEN || !BASIC_EMAIL_RE.test(email)) return { ok: false as const, reason: "format" as const };
    if (Math.floor(Date.now() / 1000) > exp) {
        return { ok: false as const, reason: "expired" as const };
    }

    const payload = `v1.${shareId}.${token}.${email}.${exp}`;
    const expected = sign(payload);
    if (!constantTimeEq(sig, expected)) return { ok: false as const, reason: "sig" as const };

    return { ok: true as const, shareId, token, email, exp };
}
