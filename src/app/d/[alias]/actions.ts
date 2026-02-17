// src/app/d/[alias]/actions.ts
"use server";

import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";
import { randomBytes } from "crypto";

export type ShareRow = {
    token: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
};

export type CreateShareResult =
    | { ok: true; token: string; url: string }
    | { ok: false; error: string; message?: string };

export type ShareStatsResult =
    | { ok: true; row: ShareRow }
    | { ok: false; error: string; message?: string };

export type RevokeShareResult =
    | { ok: true; token: string }
    | { ok: false; error: string; message?: string };

function newToken(): string {
    // 32 hex chars, URL-safe enough for path segments
    return randomBytes(16).toString("hex");
}

function baseUrlFromEnv(): string {
    const u =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.VERCEL_URL ||
        "http://localhost:3000";
    if (u.startsWith("http")) return u;
    return `https://${u}`;
}

function buildShareUrl(token: string): string {
    const base = baseUrlFromEnv().replace(/\/+$/, "");
    return `${base}/s/${token}`;
}

async function trySendResendEmail(opts: {
    to: string;
    subject: string;
    html: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const key = process.env.RESEND_API_KEY;
    const from =
        process.env.EMAIL_FROM ||
        process.env.RESEND_FROM ||
        "Cyang Docs <no-reply@cyang.io>";

    if (!key) return { ok: false, message: "RESEND_API_KEY not set" };

    try {
        const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from,
                to: [opts.to],
                subject: opts.subject,
                html: opts.html,
            }),
        });

        if (!r.ok) {
            const txt = await r.text();
            return { ok: false, message: `Resend error: ${r.status} ${txt}` };
        }
        return { ok: true };
    } catch (e: any) {
        return { ok: false, message: e?.message || "Failed to send email" };
    }
}

/**
 * Creates a share token for a doc + optionally emails it.
 *
 * Expects FormData keys (strings):
 * - docId (required)
 * - alias (optional; used only to render nicer email copy)
 * - toEmail (optional)
 * - expiresAt (optional ISO string)
 * - maxViews (optional number)
 */
export async function createAndEmailShareToken(
    form: FormData
): Promise<CreateShareResult> {
    try {
        await requireOwner();

        const docId = String(form.get("docId") || "").trim();
        const alias = String(form.get("alias") || "").trim();
        const toEmailRaw = String(form.get("toEmail") || "").trim();
        const expiresAtRaw = String(form.get("expiresAt") || "").trim();
        const maxViewsRaw = String(form.get("maxViews") || "").trim();

        if (!docId) return { ok: false, error: "bad_request", message: "Missing docId" };

        const toEmail = toEmailRaw ? toEmailRaw : null;

        const expiresAt =
            expiresAtRaw && !Number.isNaN(Date.parse(expiresAtRaw))
                ? new Date(expiresAtRaw).toISOString()
                : null;

        const maxViews =
            maxViewsRaw && /^\d+$/.test(maxViewsRaw) ? Number(maxViewsRaw) : null;

        // Ensure doc exists (no generics on sql — cast instead)
        const docRows = (await sql`
      select id::text as id, title::text as title
      from docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as { id: string; title: string | null }[];

        if (!docRows || docRows.length === 0) {
            return { ok: false, error: "not_found", message: "Document not found" };
        }

        const token = newToken();

        // Create token row (if table doesn't exist, return a clear error)
        try {
            await sql`
        insert into share_tokens (token, doc_id, to_email, expires_at, max_views)
        values (${token}, ${docId}::uuid, ${toEmail}, ${expiresAt}, ${maxViews})
      `;
        } catch (e: any) {
            return {
                ok: false,
                error: "db_error",
                message:
                    e?.message ||
                    "Failed to insert share token. Does table share_tokens exist?",
            };
        }

        const url = buildShareUrl(token);

        // If no email requested, we're done.
        if (!toEmail) return { ok: true, token, url };

        const title = docRows[0]?.title || "Document";
        const pretty = alias ? `/d/${alias}` : title;

        const subject = `Cyang Docs: ${title}`;
        const html = `
      <div style="font-family: ui-sans-serif, system-ui; line-height:1.4;">
        <h2 style="margin:0 0 8px 0;">${title}</h2>
        <p style="margin:0 0 16px 0;">You’ve been sent a private link to view: <b>${pretty}</b></p>
        <p style="margin:0 0 16px 0;">
          <a href="${url}" style="display:inline-block;padding:10px 14px;border-radius:10px;text-decoration:none;border:1px solid #ddd;">
            Open document
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:12px;">If you weren’t expecting this, you can ignore this email.</p>
      </div>
    `;

        const sent = await trySendResendEmail({ to: toEmail, subject, html });
        if (!sent.ok) {
            // Token is created; email failed — still return ok true with message
            return { ok: true, token, url };
        }

        return { ok: true, token, url };
    } catch (e: any) {
        return { ok: false, error: "exception", message: e?.message || "Error" };
    }
}

export async function getShareStatsByToken(
    token: string
): Promise<ShareStatsResult> {
    try {
        await requireOwner();

        const rows = (await sql`
      select
        st.token::text as token,
        st.to_email::text as to_email,
        st.created_at::text as created_at,
        st.expires_at::text as expires_at,
        st.max_views::int as max_views,
        st.revoked_at::text as revoked_at,
        coalesce((
          select count(*)::int
          from share_views sv
          where sv.token = st.token
        ), 0) as view_count
      from share_tokens st
      where st.token = ${token}
      limit 1
    `) as unknown as ShareRow[];

        if (!rows || rows.length === 0) {
            return { ok: false, error: "not_found", message: "Token not found" };
        }

        return { ok: true, row: rows[0] };
    } catch (e: any) {
        return { ok: false, error: "exception", message: e?.message || "Error" };
    }
}

export async function revokeShareToken(
    token: string
): Promise<RevokeShareResult> {
    try {
        await requireOwner();

        const r = (await sql`
      update share_tokens
      set revoked_at = now()
      where token = ${token}
        and revoked_at is null
      returning token::text as token
    `) as unknown as { token: string }[];

        if (!r || r.length === 0) {
            // Either missing, or already revoked
            return { ok: true, token };
        }
        return { ok: true, token: r[0].token };
    } catch (e: any) {
        return { ok: false, error: "exception", message: e?.message || "Error" };
    }
}
