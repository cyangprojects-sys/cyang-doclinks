// src/app/d/[alias]/actions.ts
"use server";

import { z } from "zod";
import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NOTE:
 * - This file is used by the client SharePanel on /d/[alias]
 * - Turbopack requires that all imports exist as real exports.
 * - This file provides:
 *   - createAndEmailShareToken
 *   - getShareStatsByToken
 *   - revokeShareToken
 *   - type CreateShareResult
 *
 * It does NOT implement password hashing; your share-password feature can live elsewhere.
 */

function baseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function isValidEmail(email: string) {
  // light validation; avoids pulling in heavy deps
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const CreateSchema = z.object({
  // SharePanel typically knows doc_id already; allow alias-only fallback as well.
  doc_id: z.string().uuid().optional(),
  alias: z.string().min(1).optional(),

  // Optional recipient email (if provided, we try to email via Resend)
  to_email: z.string().email().optional(),

  // Optional constraints
  expires_in_hours: z.number().int().positive().max(24 * 365).optional(), // up to 1 year
  max_views: z.number().int().positive().max(1000000).optional(),
});

export type CreateShareResult =
  | {
    ok: true;
    token: string;
    doc_id: string;
    to_email: string | null;
    share_url: string;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
  }
  | { ok: false; error: string; message?: string };

export type ShareStatsResult =
  | {
    ok: true;
    token: string;
    doc_id: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
    has_password: boolean;
  }
  | { ok: false; error: string; message?: string };

export type RevokeShareResult =
  | { ok: true; token: string; revoked_at: string }
  | { ok: false; error: string; message?: string };

async function resolveDocId(input: { doc_id?: string; alias?: string }) {
  if (input.doc_id) return input.doc_id;

  const alias = input.alias?.trim();
  if (!alias) return null;

  const rows = (await sql`
    select a.doc_id::text as doc_id
    from public.doc_aliases a
    where a.alias = ${alias}
    limit 1
  `) as unknown as Array<{ doc_id: string }>;

  return rows?.[0]?.doc_id ?? null;
}

async function sendResendEmail(opts: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false as const, error: "NO_RESEND_API_KEY" };

  const from =
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    process.env.MAIL_FROM ||
    "Cyang Docs <no-reply@cyang.io>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false as const, error: "RESEND_FAILED", message: txt || `HTTP ${res.status}` };
  }

  return { ok: true as const };
}

/**
 * Create a share token row and (optionally) email it.
 * Owner-only.
 */
export async function createAndEmailShareToken(
  input:
    | {
      doc_id?: string;
      alias?: string;
      to_email?: string;
      expires_in_hours?: number;
      max_views?: number;
    }
    | FormData
): Promise<CreateShareResult> {
  try {
    const owner = await requireOwner();
    if (!owner.ok) return { ok: false, error: owner.reason };

    // Accept FormData or plain object
    const raw =
      input instanceof FormData
        ? {
          doc_id: (input.get("doc_id") as string | null) ?? undefined,
          alias: (input.get("alias") as string | null) ?? undefined,
          to_email: (input.get("to_email") as string | null) ?? undefined,
          expires_in_hours: input.get("expires_in_hours")
            ? Number(input.get("expires_in_hours"))
            : undefined,
          max_views: input.get("max_views") ? Number(input.get("max_views")) : undefined,
        }
        : input;

    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "BAD_REQUEST" };

    const { to_email, expires_in_hours, max_views } = parsed.data;

    const docId = await resolveDocId({ doc_id: parsed.data.doc_id, alias: parsed.data.alias });
    if (!docId) return { ok: false, error: "DOC_NOT_FOUND", message: "doc_id or alias not found" };

    // optional: verify doc exists and is ready
    const docRows = (await sql`
      select id::text as id, title::text as title
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as Array<{ id: string; title: string | null }>;

    if (!docRows.length) return { ok: false, error: "DOC_NOT_FOUND" };

    const token = crypto.randomUUID();

    const expiresAt =
      typeof expires_in_hours === "number" && Number.isFinite(expires_in_hours) && expires_in_hours > 0
        ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString()
        : null;

    const mv =
      typeof max_views === "number" && Number.isFinite(max_views) && max_views > 0
        ? Math.trunc(max_views)
        : null;

    const toEmail = to_email?.trim() ? to_email.trim() : null;

    // Insert share row
    const inserted = (await sql`
      insert into public.doc_shares (
        token,
        doc_id,
        to_email,
        expires_at,
        max_views,
        view_count,
        revoked_at,
        password_hash
      )
      values (
        ${token}::uuid,
        ${docId}::uuid,
        ${toEmail},
        ${expiresAt}::timestamptz,
        ${mv},
        0,
        null,
        null
      )
      returning
        token::text as token,
        doc_id::text as doc_id,
        to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views
    `) as unknown as Array<{
      token: string;
      doc_id: string;
      to_email: string | null;
      created_at: string;
      expires_at: string | null;
      max_views: number | null;
    }>;

    const row = inserted[0];
    const shareUrl = `${baseUrl()}/s/${encodeURIComponent(row.token)}`;

    // Optional email
    if (toEmail && isValidEmail(toEmail)) {
      const title = docRows[0]?.title || "Document";
      const subject = `Shared with you: ${title}`;
      const html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5;">
          <h2 style="margin: 0 0 10px 0;">${title}</h2>
          <p style="margin: 0 0 14px 0;">A document has been shared with you.</p>
          <p style="margin: 0 0 18px 0;">
            <a href="${shareUrl}" style="display:inline-block; padding:10px 14px; border-radius:10px; background:#111; color:#fff; text-decoration:none;">
              Open shared link
            </a>
          </p>
          <div style="color:#666; font-size:12px;">
            ${expiresAt ? `Expires: ${new Date(expiresAt).toLocaleString()}` : "No expiration"}
            ${mv ? ` • Max views: ${mv}` : ""}
          </div>
        </div>
      `;

      // best-effort — never fail share creation if email fails
      try {
        await sendResendEmail({ to: toEmail, subject, html });
      } catch {
        // ignore
      }
    }

    return {
      ok: true,
      token: row.token,
      doc_id: row.doc_id,
      to_email: row.to_email,
      share_url: shareUrl,
      created_at: row.created_at,
      expires_at: row.expires_at,
      max_views: row.max_views,
    };
  } catch (err: any) {
    return { ok: false, error: "SERVER_ERROR", message: err?.message ?? String(err) };
  }
}

/**
 * Fetch share stats for UI display (owner-only).
 */
export async function getShareStatsByToken(token: string): Promise<ShareStatsResult> {
  try {
    const owner = await requireOwner();
    if (!owner.ok) return { ok: false, error: owner.reason };

    const parsed = z.string().uuid().safeParse(token);
    if (!parsed.success) return { ok: false, error: "BAD_TOKEN" };

    const rows = (await sql`
      select
        token::text as token,
        doc_id::text as doc_id,
        to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views,
        view_count,
        revoked_at::text as revoked_at,
        (password_hash is not null) as has_password
      from public.doc_shares
      where token = ${parsed.data}::uuid
      limit 1
    `) as unknown as Array<{
      token: string;
      doc_id: string;
      to_email: string | null;
      created_at: string;
      expires_at: string | null;
      max_views: number | null;
      view_count: number | null;
      revoked_at: string | null;
      has_password: boolean;
    }>;

    if (!rows.length) return { ok: false, error: "NOT_FOUND" };

    const r = rows[0];
    return {
      ok: true,
      token: r.token,
      doc_id: r.doc_id,
      to_email: r.to_email,
      created_at: r.created_at,
      expires_at: r.expires_at,
      max_views: r.max_views,
      view_count: Number(r.view_count ?? 0),
      revoked_at: r.revoked_at,
      has_password: Boolean(r.has_password),
    };
  } catch (err: any) {
    return { ok: false, error: "SERVER_ERROR", message: err?.message ?? String(err) };
  }
}

/**
 * Revoke a share token (owner-only).
 */
export async function revokeShareToken(token: string): Promise<RevokeShareResult> {
  try {
    const owner = await requireOwner();
    if (!owner.ok) return { ok: false, error: owner.reason };

    const parsed = z.string().uuid().safeParse(token);
    if (!parsed.success) return { ok: false, error: "BAD_TOKEN" };

    const rows = (await sql`
      update public.doc_shares
      set revoked_at = now()
      where token = ${parsed.data}::uuid
        and revoked_at is null
      returning token::text as token, revoked_at::text as revoked_at
    `) as unknown as Array<{ token: string; revoked_at: string }>;

    if (!rows.length) {
      return { ok: false, error: "NOT_FOUND_OR_ALREADY_REVOKED" };
    }

    return { ok: true, token: rows[0].token, revoked_at: rows[0].revoked_at };
  } catch (err: any) {
    return { ok: false, error: "SERVER_ERROR", message: err?.message ?? String(err) };
  }
}
