// src/app/s/[token]/actions.ts
"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";

const UNLOCK_HOURS = 8;
const RATE_LIMIT_PER_MIN = 10;

function getClientIpFromHeaders(): string {
    // For Server Actions, we don't get NextRequest easily.
    // Try common headers that Vercel/Next set; fallback to empty.
    // (Route handler will have better access; this is good enough.)
    return "";
}

function hashIp(ip: string) {
    const salt = process.env.VIEW_SALT || process.env.SHARE_SALT || "";
    if (!salt || !ip) return null;
    return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function cookieName(token: string) {
    return `share_unlock_${token}`;
}

function randomId() {
    return crypto.randomBytes(24).toString("base64url");
}

/**
 * Resolve share row from either doc_shares OR share_tokens.
 * Returns normalized fields needed for gating and validation.
 */
async function getShareRow(token: string): Promise<
    | {
        ok: true;
        table: "doc_shares" | "share_tokens";
        token: string;
        doc_id: string;
        revoked_at: string | null;
        expires_at: string | null;
        max_views: number | null;
        view_count: number;
        password_hash: string | null;
    }
    | { ok: false }
> {
    // Try doc_shares first
    try {
        const rows = (await sql`
      select
        token::text as token,
        doc_id::text as doc_id,
        revoked_at::text as revoked_at,
        expires_at::text as expires_at,
        max_views,
        view_count,
        password_hash
      from public.doc_shares
      where token = ${token}
      limit 1
    `) as unknown as Array<{
            token: string;
            doc_id: string;
            revoked_at: string | null;
            expires_at: string | null;
            max_views: number | null;
            view_count: number | null;
            password_hash: string | null;
        }>;

        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true,
                table: "doc_shares",
                token: r.token,
                doc_id: r.doc_id,
                revoked_at: r.revoked_at,
                expires_at: r.expires_at,
                max_views: r.max_views,
                view_count: Number(r.view_count ?? 0),
                password_hash: r.password_hash ?? null,
            };
        }
    } catch {
        // ignore; table may not exist
    }

    // Fallback: share_tokens
    try {
        const rows = (await sql`
      select
        token::text as token,
        doc_id::text as doc_id,
        revoked_at::text as revoked_at,
        expires_at::text as expires_at,
        max_views,
        views_count,
        password_hash
      from public.share_tokens
      where token::text = ${token}
         or token = ${token}
      limit 1
    `) as unknown as Array<{
            token: string;
            doc_id: string;
            revoked_at: string | null;
            expires_at: string | null;
            max_views: number | null;
            views_count: number | null;
            password_hash: string | null;
        }>;

        if (rows?.length) {
            const r = rows[0];
            return {
                ok: true,
                table: "share_tokens",
                token: r.token,
                doc_id: r.doc_id,
                revoked_at: r.revoked_at,
                expires_at: r.expires_at,
                max_views: r.max_views,
                view_count: Number(r.views_count ?? 0),
                password_hash: r.password_hash ?? null,
            };
        }
    } catch {
        // ignore
    }

    return { ok: false };
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

async function isUnlocked(token: string): Promise<boolean> {
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
    | { ok: false; error: "not_found" | "revoked" | "expired" | "maxed" | "rate_limited" | "bad_password"; message: string };

export async function verifySharePasswordAction(formData: FormData): Promise<VerifySharePasswordResult> {
    const token = String(formData.get("token") || "").trim();
    const password = String(formData.get("password") || "");

    if (!token) return { ok: false, error: "not_found", message: "Missing token." };

    const share = await getShareRow(token);
    if (!share.ok) return { ok: false, error: "not_found", message: "Share not found." };

    if (share.revoked_at) return { ok: false, error: "revoked", message: "This share was revoked." };
    if (isExpired(share.expires_at)) return { ok: false, error: "expired", message: "This share link has expired." };
    if (isMaxed(share.view_count, share.max_views)) return { ok: false, error: "maxed", message: "This share link has reached its max views." };

    // If no password set, treat as ok (and still set an unlock cookie so /raw is gated consistently)
    const passwordHash = share.password_hash;
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

        return { ok: true };
    }

    // Rate limit only if password is set
    const ip = getClientIpFromHeaders();
    const ipHash = hashIp(ip) || "noip";
    const ok = await rateLimitOk(token, ipHash);
    if (!ok) {
        return { ok: false, error: "rate_limited", message: "Too many attempts. Try again in a minute." };
    }

    // record attempt (always)
    await sql`
    insert into public.share_pw_attempts (token, ip_hash)
    values (${token}, ${ipHash})
  `;

    const match = await bcrypt.compare(password, passwordHash);
    if (!match) {
        return { ok: false, error: "bad_password", message: "Incorrect password." };
    }

    // Create unlock session + cookie (8 hours)
    const unlockId = randomId();
    const expiresAt = new Date(Date.now() + UNLOCK_HOURS * 3600 * 1000);

    await sql`
    insert into public.share_unlocks (token, unlock_id, ip_hash, expires_at)
    values (${token}, ${unlockId}, ${ipHash}, ${expiresAt.toISOString()})
  `;

    const c = await cookies();
    c.set(cookieName(token), unlockId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: `/s/${token}`,
        maxAge: UNLOCK_HOURS * 3600,
    });

    return { ok: true };
}

export async function isShareUnlockedAction(token: string): Promise<boolean> {
    const t = (token || "").trim();
    if (!t) return false;
    return isUnlocked(t);
}
