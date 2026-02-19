// src/app/d/[alias]/actions.ts
"use server";

import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

export type CreateShareResult =
  | { ok: true; token: string; url: string }
  | { ok: false; error: string; message?: string };

export type ShareStatsResult =
  | { ok: true; row: any }
  | { ok: false; error: string; message?: string };

export type RevokeShareResult =
  | { ok: true; token: string }
  | { ok: false; error: string; message?: string };

function newToken(): string {
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
  // IMPORTANT: link users to /s/<token> (NOT /raw) so they hit the gate UI.
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
    const passwordRaw = String(form.get("password") || "");

    if (!docId) return { ok: false, error: "bad_request", message: "Missing docId" };

    const toEmail = toEmailRaw ? toEmailRaw.toLowerCase() : null;

    const expiresAt =
      expiresAtRaw && !Number.isNaN(Date.parse(expiresAtRaw))
        ? new Date(expiresAtRaw).toISOString()
        : null;

    const maxViews =
      maxViewsRaw && /^\d+$/.test(maxViewsRaw) ? Number(maxViewsRaw) : null;

    const password = passwordRaw.trim();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

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

    await sql`
      insert into share_tokens (token, doc_id, to_email, expires_at, max_views, password_hash)
      values (${token}, ${docId}::uuid, ${toEmail}, ${expiresAt}, ${maxViews}, ${passwordHash})
    `;

    const url = buildShareUrl(token);

    // no recipient email → just return
    if (!toEmail) return { ok: true, token, url };

    const title = docRows[0]?.title || "Document";
    const pretty = alias ? `/d/${alias}` : title;

    const subject = `Cyang Docs: ${title}`;

    const gates: string[] = [];
    gates.push(`Email required: <b>${toEmail}</b>`);
    if (passwordHash) gates.push(`Password required`);

    const html = `
      <div style="font-family: ui-sans-serif, system-ui; line-height:1.4;">
        <h2>${title}</h2>
        <p>You’ve been sent a private link to view: <b>${pretty}</b></p>
        <p>${gates.length ? `Access rules: ${gates.join(" · ")}` : ""}</p>
        <p>
          <a href="${url}" style="display:inline-block;padding:10px 14px;border-radius:10px;text-decoration:none;border:1px solid #ddd;">
            Open document
          </a>
        </p>
        <p style="color:#777;font-size:12px;margin-top:14px;">
          Tip: This link will open a secure gate page first, then load the PDF.
        </p>
      </div>
    `;

    await trySendResendEmail({ to: toEmail, subject, html });
    return { ok: true, token, url };
  } catch (e: any) {
    return { ok: false, error: "exception", message: e?.message || "Error" };
  }
}

export async function getShareStatsByToken(token: string): Promise<ShareStatsResult> {
  try {
    await requireOwner();

    const rows = await sql`
      select
        token::text as token,
        doc_id::text as doc_id,
        to_email::text as to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views,
        revoked_at::text as revoked_at,
        views_count
      from share_tokens
      where token = ${token}
      limit 1
    `;

    const row = (rows as any).rows?.[0] ?? null;
    if (!row) return { ok: false, error: "not_found", message: "Token not found" };
    return { ok: true, row };
  } catch (e: any) {
    return { ok: false, error: "exception", message: e?.message || "Error" };
  }
}

export async function revokeShareToken(token: string): Promise<RevokeShareResult> {
  try {
    await requireOwner();

    await sql`
      update share_tokens
      set revoked_at = now()
      where token = ${token}
    `;

    return { ok: true, token };
  } catch (e: any) {
    return { ok: false, error: "exception", message: e?.message || "Error" };
  }
}
