// src/app/d/[alias]/actions.ts
"use server";

import { sql } from "@/lib/db";
import { requireDocWrite } from "@/lib/authz";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { emitWebhook } from "@/lib/webhooks";
import { assertCanCreateShare, getPlanForUser, normalizeExpiresAtForPlan, normalizeMaxViewsForPlan } from "@/lib/monetization";

/**
 * NOTE:
 * SharePanel synthesizes a ShareRow immediately after creating a token,
 * before it can hydrate real stats from the DB. For that reason `doc_id`
 * is optional here.
 */
export type ShareRow = {
  token: string;
  doc_id?: string;
  to_email: string | null;
  created_at: string;
  expires_at: string | null;
  max_views: number | null;
  view_count: number | null;
  revoked_at: string | null;
  last_viewed_at: string | null;
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

  if (!key) return { ok: false, message: "Email service unavailable" };

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
      return { ok: false, message: "Failed to send email" };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: "Failed to send email" };
  }
}

export async function createAndEmailShareToken(
  form: FormData
): Promise<CreateShareResult> {
  try {
    const docId = String(form.get("docId") || "").trim();
    const alias = String(form.get("alias") || "").trim();
    const shareTitleRaw = String(form.get("shareTitle") || "").trim();
    const shareTitle = shareTitleRaw ? shareTitleRaw.slice(0, 240) : null;
    const toEmailRaw = String(form.get("toEmail") || "").trim();
    const expiresAtRaw = String(form.get("expiresAt") || "").trim();
    const maxViewsRaw = String(form.get("maxViews") || "").trim();
    const passwordRaw = String(form.get("password") || "");
    const allowDownloadRaw = String(form.get("allowDownload") || "").trim().toLowerCase();
    const allowedCountriesRaw = String(form.get("allowedCountries") || form.get("allowed_countries") || "").trim();
    const blockedCountriesRaw = String(form.get("blockedCountries") || form.get("blocked_countries") || "").trim();

    if (!docId)
      return { ok: false, error: "bad_request", message: "Missing docId" };

    await requireDocWrite(docId);

    const toEmail = toEmailRaw ? toEmailRaw.toLowerCase() : null;

    let expiresAt =
      expiresAtRaw && !Number.isNaN(Date.parse(expiresAtRaw))
        ? new Date(expiresAtRaw).toISOString()
        : null;

    const requestedMaxViews =
      maxViewsRaw && /^\d+$/.test(maxViewsRaw) ? Number(maxViewsRaw) : null;
    let maxViews: number | null = requestedMaxViews;

    const password = passwordRaw.trim();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const allowDownload = ["1", "true", "on", "yes"].includes(allowDownloadRaw);
    const parseCountries = (raw: string): string[] | null => {
      if (!raw) return null;
      const out = raw
        .split(/[,\s]+/g)
        .map((x) => x.trim().toUpperCase())
        .filter((x) => /^[A-Z]{2}$/.test(x));
      return out.length ? out : [];
    };
    const allowedCountries = parseCountries(allowedCountriesRaw);
    const blockedCountries = parseCountries(blockedCountriesRaw);

    const docRows = (await sql`
      select id::text as id, title::text as title, owner_id::text as owner_id
      from public.docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as { id: string; title: string | null }[];

    if (!docRows || docRows.length === 0) {
      return { ok: false, error: "not_found", message: "Document not found" };
    }


    const ownerId = (docRows as any)?.[0]?.owner_id ?? null;
    let ownerPlan: Awaited<ReturnType<typeof getPlanForUser>> | null = null;
    if (ownerId) {
      ownerPlan = await getPlanForUser(ownerId);
      const shareAllowed = await assertCanCreateShare(ownerId);
      if (!shareAllowed.ok) {
        return { ok: false, error: shareAllowed.error, message: shareAllowed.message };
      }
    }

    // Free plan cannot mutate document title from share creation flow.
    if (shareTitle && ownerPlan?.id !== "free") {
      await sql`
        update public.docs
        set title = ${shareTitle}
        where id = ${docId}::uuid
      `;
    }

// --- Monetization: custom expiration is currently hidden ---
// If plan disallows, clamp to <= 7 days.
    if (ownerPlan) {
      const normalized = normalizeExpiresAtForPlan({ plan: ownerPlan, requestedExpiresAtIso: expiresAt, defaultDaysIfNotAllowed: 7 });
      expiresAt = normalized;
      maxViews = normalizeMaxViewsForPlan({ plan: ownerPlan, requestedMaxViews });
    }

    const token = newToken();

    try {
      await sql`
        insert into public.share_tokens
          (token, doc_id, to_email, expires_at, max_views, password_hash, allow_download, allowed_countries, blocked_countries)
        values
          (${token}, ${docId}::uuid, ${toEmail}, ${expiresAt}, ${maxViews}, ${passwordHash}, ${allowDownload}, ${allowedCountries}, ${blockedCountries})
      `;
    } catch {
      // Backward compatibility for environments where allow_download has not been migrated yet.
      await sql`
        insert into public.share_tokens (token, doc_id, to_email, expires_at, max_views, password_hash)
        values (${token}, ${docId}::uuid, ${toEmail}, ${expiresAt}, ${maxViews}, ${passwordHash})
      `;
    }

    // Webhook (best-effort)
    emitWebhook("share.created", {
      token,
      doc_id: docId,
      alias: alias ?? null,
      to_email: toEmail,
      expires_at: expiresAt,
      max_views: maxViews,
      has_password: !!passwordHash,
      allow_download: allowDownload,
    });

    const url = buildShareUrl(token);

    // no recipient email → just return
    if (!toEmail) return { ok: true, token, url };

    const title = (ownerPlan?.id === "free" ? null : shareTitle) || docRows[0]?.title || "Document";
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
    return { ok: false, error: "exception", message: "Unable to create share." };
  }
}

export async function getShareStatsByToken(
  token: string
): Promise<ShareStatsResult> {
  try {
    const rows = (await sql`
      select
        token::text as token,
        doc_id::text as doc_id,
        to_email,
        created_at::text as created_at,
        expires_at::text as expires_at,
        max_views,
        views_count,
        revoked_at::text as revoked_at
      from public.share_tokens
      where token = ${token}
      limit 1
    `) as unknown as Array<{
      token: string;
      doc_id: string;
      to_email: string | null;
      created_at: string;
      expires_at: string | null;
      max_views: number | null;
      views_count: number | null;
      revoked_at: string | null;
    }>;

    const r = rows[0];
    if (!r) return { ok: false, error: "not_found", message: "Token not found" };

    await requireDocWrite(r.doc_id);

    const row: ShareRow = {
      token: r.token,
      doc_id: r.doc_id,
      to_email: r.to_email,
      created_at: r.created_at,
      expires_at: r.expires_at,
      max_views: r.max_views,
      view_count: r.views_count ?? 0,
      revoked_at: r.revoked_at,
      last_viewed_at: null,
    };

    return { ok: true, row };
  } catch (e: any) {
    return { ok: false, error: "exception", message: "Unable to load share stats." };
  }
}

export async function revokeShareToken(
  token: string
): Promise<RevokeShareResult> {
  try {
    // Lookup doc_id first so we can enforce ownership.
    const rows = (await sql`
      select doc_id::text as doc_id
      from public.share_tokens
      where token = ${token}
      limit 1
    `) as unknown as Array<{ doc_id: string }>;

    const docId = rows?.[0]?.doc_id ?? null;
    if (!docId) return { ok: false, error: "not_found", message: "Token not found" };

    await requireDocWrite(docId);

    await sql`
      update public.share_tokens
      set revoked_at = now()
      where token = ${token}
    `;

    return { ok: true, token };
  } catch (e: any) {
    return { ok: false, error: "exception", message: "Unable to revoke share." };
  }
}
