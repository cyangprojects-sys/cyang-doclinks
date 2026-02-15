"use server";

import { sql } from "@/lib/db";
import { randomBytes } from "node:crypto";

/**
 * Base URL used to construct absolute links in emails.
 */
function siteBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function makeToken() {
  // URL-safe token suitable for /s/<token>
  return randomBytes(24).toString("base64url");
}

export type ShareDocToEmailInput = {
  docId: string;
  email: string;
  days?: number;
  maxViews?: number;
};

export type ShareDocToEmailResult =
  | {
      ok: true;
      token: string;
      url: string;
      emailed: boolean;
      message?: string;
    }
  | { ok: false; error: string; message?: string };

/**
 * Creates a share token and (optionally) emails the link.
 *
 * IMPORTANT: ShareForm.tsx calls this with a single object argument:
 *   shareDocToEmail({ docId, email })
 * So this function signature matches that call-site.
 */
export async function shareDocToEmail(
  input: ShareDocToEmailInput
): Promise<ShareDocToEmailResult> {
  try {
    const docId = input?.docId;
    const toEmail = (input?.email || "").trim().toLowerCase();

    if (!docId) return { ok: false, error: "bad_request", message: "Missing docId" };
    if (!toEmail) return { ok: false, error: "bad_request", message: "Missing email" };

    const token = makeToken();

    const days =
      typeof input.days === "number" && Number.isFinite(input.days) ? input.days : null;

    const maxViews =
      typeof input.maxViews === "number" && Number.isFinite(input.maxViews)
        ? Math.floor(input.maxViews)
        : null;

    const expiresAt =
      days != null ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;

    // Insert token row (TEXT token). Supports /s/<token> routes.
    // If your table uses UUID tokens, switch token column to uuid + use gen_random_uuid().
    await sql`
      insert into public.share_tokens (token, doc_id, expires_at, max_views, views_count)
      values (${token}, ${docId}::uuid, ${expiresAt}, ${maxViews}, 0)
    `;

    const url = `${siteBaseUrl()}/s/${encodeURIComponent(token)}`;

    // Optional email delivery via Resend (if configured)
    const resendKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM || "Cyang Docs <no-reply@cyang.io>";

    let emailed = false;
    let message: string | undefined;

    if (resendKey) {
      const subject = "Your document link";
      const html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
          <p>Here is your link:</p>
          <p><a href="${url}">${url}</a></p>
          <p style="color:#888;font-size:12px;">If you did not expect this email, you can ignore it.</p>
        </div>
      `;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [toEmail],
          subject,
          html,
        }),
      });

      if (res.ok) {
        emailed = true;
      } else {
        const txt = await res.text().catch(() => "");
        message = `Created link, but email failed: ${txt || res.status}`;
      }
    } else {
      message = "Created link. RESEND_API_KEY not set, so no email was sent.";
    }

    return { ok: true, token, url, emailed, message };
  } catch (e: any) {
    return { ok: false, error: "server_error", message: e?.message || "Failed to share" };
  }
}

export type CreateShareTokenOpts = {
  days?: number;
  maxViews?: number;
};

export type CreateShareTokenResult =
  | { ok: true; token: string; url: string; expires_at: string | null; max_views: number | null }
  | { ok: false; error: string; message?: string };

/**
 * Creates a share token without emailing.
 */
export async function createShareToken(
  docId: string,
  opts: CreateShareTokenOpts = {}
): Promise<CreateShareTokenResult> {
  try {
    if (!docId) return { ok: false, error: "bad_request", message: "Missing docId" };

    const token = makeToken();

    const days = typeof opts.days === "number" && Number.isFinite(opts.days) ? opts.days : null;
    const maxViews =
      typeof opts.maxViews === "number" && Number.isFinite(opts.maxViews) ? Math.floor(opts.maxViews) : null;

    const expiresAt =
      days != null ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;

    const rows = (await sql`
      insert into public.share_tokens (token, doc_id, expires_at, max_views, views_count)
      values (${token}, ${docId}::uuid, ${expiresAt}, ${maxViews}, 0)
      returning token::text as token, expires_at::text as expires_at, max_views
    `) as { token: string; expires_at: string | null; max_views: number | null }[];

    const created = rows?.[0];
    if (!created?.token) return { ok: false, error: "db_insert_failed" };

    const url = `${siteBaseUrl()}/s/${encodeURIComponent(created.token)}`;

    return {
      ok: true,
      token: created.token,
      url,
      expires_at: created.expires_at,
      max_views: created.max_views,
    };
  } catch (e: any) {
    return { ok: false, error: "server_error", message: e?.message || "Failed to create token" };
  }
}
