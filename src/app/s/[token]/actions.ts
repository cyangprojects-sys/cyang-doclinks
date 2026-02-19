// src/app/s/[token]/actions.ts
"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { resolveShareMeta } from "@/lib/resolveDoc";

const UNLOCK_HOURS = 8;
const RATE_LIMIT_PER_MIN = 10;

function cookieName(token: string) {
    return `share_unlock_${token}`;
}

function emailCookieName(token: string) {
    return `share_email_${token}`;
}

function randomId() {
    return crypto.randomBytes(24).toString("base64url");
}

function isExpired(expires_at: string | null) {
    if (!expires_at) return false;
    const t = new Date(expires_at).getTime();
    return Number.isFinite(t) && t <= Date.now();
}

function isMaxed(view_count: number, max_views: number | null) {
    if (max_views === null) return false;
    if (max_views === 0) return false; // 0 = unlimited
    return view_count >= max_views;
}

async function getClientIpFromHeaders(): Promise<string> {
    const h = await headers();
    const xff = h.get("x-forwarded-for") || "";
    return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
    const salt = process.env.VIEW_SALT || process.env.SHARE_SALT || "";
    if (!salt || !ip) return null;
    return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

export async function isShareUnlockedAction(token: string): Promise<boolean> {
    const c = await cookies();
    const unlockId = c.get(cookieName(token))?.value || "";
    if (!unlockId) return false;

    const rows = (await sql`
    select 1
    from public.share_unlocks
    where token = ${token}
      and unlock_id = ${unlockId}
      and expires_at > now()
    limit 1
  `) as unknown as Array<{ "?column?": number }>;

    return rows.length > 0;
}

async function rateLimitOk(token: string, ipHash: string) {
    const rows = (await sql`
    select count(*)::int as c
    from public.share_pw_attempts
    where token = ${token}
      and ip_hash = ${ipHash}
      and created_at > now() - interval '1 minute'
  `) as unknown as Array<{ c: number }>;

    const c = rows?.[0]?.c ?? 0;
    return c < RATE_LIMIT_PER_MIN;
}

export type VerifySharePasswordResult =
    | { ok: true }
    | {
        ok: false;
        error:
        | "not_found"
        | "revoked"
        | "expired"
        | "maxed"
        | "rate_limited"
        | "bad_password";
        message: string;
    };

/**
 * Core verifier that returns a structured result.
 */
export async function verifySharePasswordCore(
    formData: FormData
): Promise<VerifySharePasswordResult> {
    const token = String(formData.get("token") || "").trim();
    const password = String(formData.get("password") || "");
    const emailInput = String(formData.get("email") || "").trim().toLowerCase();

    if (!token) return { ok: false, error: "not_found", message: "Missing token." };

    const share = await resolveShareMeta(token);
    if (!share.ok) return { ok: false, error: "not_found", message: "Share not found." };

    // Recipient restriction (forward protection)
    if (share.toEmail) {
        const required = String(share.toEmail || "").trim().toLowerCase();
        if (!emailInput) {
            return {
                ok: false,
                error: "bad_password",
                message: "Enter the recipient email for this share.",
            };
        }
        if (emailInput !== required) {
            return {
                ok: false,
                error: "bad_password",
                message: "That email doesn’t match the recipient for this share.",
            };
        }
    }

    if (share.revokedAt) return { ok: false, error: "revoked", message: "This share was revoked." };
    if (isExpired(share.expiresAt)) return { ok: false, error: "expired", message: "This share link has expired." };
    if (isMaxed(share.viewCount, share.maxViews))
        return { ok: false, error: "maxed", message: "This share link has reached its max views." };

    const passwordHash = share.passwordHash;

    // No password set → unlock immediately (still creates DB unlock session + cookie)
    if (!passwordHash) {
        const unlockId = randomId();
        const expiresAt = new Date(Date.now() + UNLOCK_HOURS * 3600 * 1000);

        await sql`
      insert into public.share_unlocks (token, unlock_id, ip_hash, expires_at)
      values (${token}, ${unlockId}, ${null}, ${expiresAt.toISOString()})
    `;

        const c = await cookies();
        c.set(cookieName(token), unlockId, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: `/s/${token}`,
            maxAge: UNLOCK_HOURS * 3600,
        });

        // Store email used (if any) so /raw can audit it.
        if (share.toEmail) {
            c.set(emailCookieName(token), String(share.toEmail).trim().toLowerCase(), {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: `/s/${token}`,
                maxAge: UNLOCK_HOURS * 3600,
            });
        }

        return { ok: true };
    }

    // Rate limit (best-effort)
    try {
        const ip = await getClientIpFromHeaders();
        const ipHash = hashIp(ip) || "unknown";

        const ok = await rateLimitOk(token, ipHash);
        if (!ok) return { ok: false, error: "rate_limited", message: "Too many attempts. Try again soon." };

        await sql`
      insert into public.share_pw_attempts (token, ip_hash)
      values (${token}, ${ipHash})
    `;
    } catch {
        // If attempts table missing, don’t block unlock.
    }

    const match = await bcrypt.compare(password, passwordHash);
    if (!match) return { ok: false, error: "bad_password", message: "Incorrect password." };

    const unlockId = randomId();
    const expiresAt = new Date(Date.now() + UNLOCK_HOURS * 3600 * 1000);

    await sql`
    insert into public.share_unlocks (token, unlock_id, ip_hash, expires_at)
    values (${token}, ${unlockId}, ${null}, ${expiresAt.toISOString()})
  `;

    const c = await cookies();
    c.set(cookieName(token), unlockId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: `/s/${token}`,
        maxAge: UNLOCK_HOURS * 3600,
    });

    if (share.toEmail) {
        c.set(emailCookieName(token), String(share.toEmail).trim().toLowerCase(), {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: `/s/${token}`,
            maxAge: UNLOCK_HOURS * 3600,
        });
    }

    return { ok: true };
}

/**
 * Use THIS for <form action={...}>.
 * Must return void/Promise<void>. Redirects instead of returning data.
 */
export async function verifySharePasswordAction(formData: FormData): Promise<void> {
    const token = String(formData.get("token") || "").trim();
    const res = await verifySharePasswordCore(formData);

    if (res.ok) {
        redirect(`/s/${encodeURIComponent(token)}/raw`);
    }

    redirect(`/s/${encodeURIComponent(token)}?error=${encodeURIComponent(res.message)}`);
}

/**
 * Use THIS from client components (like passwordGate.tsx).
 * Returns a result object; does NOT redirect.
 */
export async function verifySharePasswordResultAction(
    formData: FormData
): Promise<VerifySharePasswordResult> {
    return verifySharePasswordCore(formData);
}
