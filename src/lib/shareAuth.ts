// src/lib/shareAuth.ts
import crypto from "crypto";

const COOKIE_NAME = "cyang_share_unlock";
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
    if (!secret) throw new Error("Missing SHARE_COOKIE_SECRET (or VIEW_SALT/NEXTAUTH_SECRET).");
    return b64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function shareUnlockCookieName() {
    return COOKIE_NAME;
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

    // constant-time compare
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return { ok: false as const, reason: "sig" as const };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false as const, reason: "sig" as const };

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
