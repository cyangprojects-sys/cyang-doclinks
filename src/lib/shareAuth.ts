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

function constantTimeEq(aStr: string, bStr: string) {
    const a = Buffer.from(aStr);
    const b = Buffer.from(bStr);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/** ========= SHARE UNLOCK COOKIE ========= */

export function shareUnlockCookieName() {
    return SHARE_UNLOCK_COOKIE;
}

export function makeUnlockCookieValue(token: string, nowMs = Date.now()) {
    const exp = Math.floor(nowMs / 1000) + EIGHT_HOURS_SEC; // unix seconds
    const payload = `${token}.${exp}`;
    const sig = sign(payload);
    return `${payload}.${sig}`;
}

export function verifyUnlockCookieValue(value: string | undefined | null) {
    if (!value) return { ok: false as const, reason: "missing" as const };
    const parts = value.split(".");
    if (parts.length !== 3) return { ok: false as const, reason: "format" as const };

    const [token, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!token || !Number.isFinite(exp)) return { ok: false as const, reason: "format" as const };
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
    const exp = Math.floor(nowMs / 1000) + EIGHT_HOURS_SEC;
    const payload = `v1.${shareId}.${deviceHash}.${exp}`;
    const sig = sign(payload);
    return `${payload}.${sig}`;
}

export function verifyDeviceTrustCookieValue(value: string | undefined | null) {
    if (!value) return { ok: false as const, reason: "missing" as const };
    const parts = value.split(".");
    // v1.shareId.deviceHash.exp.sig => 5 parts
    if (parts.length !== 5) return { ok: false as const, reason: "format" as const };

    const [v, shareId, deviceHash, expStr, sig] = parts;
    if (v !== "v1") return { ok: false as const, reason: "format" as const };

    const exp = Number(expStr);
    if (!shareId || !deviceHash || !Number.isFinite(exp)) {
        return { ok: false as const, reason: "format" as const };
    }
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
    const nowMs = args.nowMs ?? Date.now();
    const ttl = args.ttlSec ?? 10 * 60;
    const exp = Math.floor(nowMs / 1000) + ttl;

    const emailNorm = args.email.trim().toLowerCase();
    const payload = `v1.${args.shareId}.${args.token}.${emailNorm}.${exp}`;
    const sig = sign(payload);
    return `${payload}.${sig}`;
}

export function verifyEmailProofToken(value: string | undefined | null) {
    if (!value) return { ok: false as const, reason: "missing" as const };
    const parts = value.split(".");
    // v1.shareId.token.email.exp.sig => 6 parts
    if (parts.length !== 6) return { ok: false as const, reason: "format" as const };

    const [v, shareId, token, email, expStr, sig] = parts;
    if (v !== "v1") return { ok: false as const, reason: "format" as const };

    const exp = Number(expStr);
    if (!shareId || !token || !email || !Number.isFinite(exp)) {
        return { ok: false as const, reason: "format" as const };
    }
    if (Math.floor(Date.now() / 1000) > exp) {
        return { ok: false as const, reason: "expired" as const };
    }

    const payload = `v1.${shareId}.${token}.${email}.${exp}`;
    const expected = sign(payload);
    if (!constantTimeEq(sig, expected)) return { ok: false as const, reason: "sig" as const };

    return { ok: true as const, shareId, token, email, exp };
}
