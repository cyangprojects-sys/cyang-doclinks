// src/app/d/[alias]/actions.ts
"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { sendShareEmail } from "@/lib/email";
import { requireOwnerAdmin } from "@/lib/admin";

type DocRow = {
  id: string;
  title: string | null;
};

type AliasRow = {
  doc_id: string;
  alias: string;
};

function envStr(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function toInt(v: string | null | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function fmtDateLabel(d: Date) {
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function computeViewsLeftLabel(viewCount: number, maxViews: number | null) {
  if (maxViews === null || maxViews === 0) return "Unlimited";
  const left = Math.max(0, maxViews - viewCount);
  return String(left);
}

export type CreateShareResult =
  | {
    ok: true;
    share_url: string;
    token: string; // uuid string
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    views_left_label: string;
    password_required: boolean;
  }
  | { ok: false; error: string; message?: string };

export async function createAndEmailShareToken(input: {
  alias: string;
  to_email: string;
  expires_hours?: number | null;
  max_views?: number | null;
  password?: string | null; // NEW
}): Promise<CreateShareResult> {
  try {
    await requireOwnerAdmin();

    const alias = (input.alias || "").trim();
    const to = (input.to_email || "").trim().toLowerCase();
    const password = (input.password ?? "").toString();

    if (!alias) return { ok: false, error: "bad_request", message: "Missing alias." };
    if (!to || !to.includes("@")) {
      return { ok: false, error: "bad_request", message: "Enter a valid email." };
    }

    const defaultExp = toInt(process.env.DEFAULT_SHARE_EXPIRES_HOURS, 72);
    const defaultMax = toInt(process.env.DEFAULT_SHARE_MAX_VIEWS, 3);

    const expiresHours =
      input.expires_hours === null || input.expires_hours === undefined
        ? defaultExp
        : Math.max(0, Math.floor(input.expires_hours));

    const maxViews =
      input.max_views === null || input.max_views === undefined
        ? defaultMax
        : Math.max(0, Math.floor(input.max_views));

    const arows = (await sql`
      select doc_id::text as doc_id, alias
      from doc_aliases
      where alias = ${alias}
      limit 1
    `) as unknown as AliasRow[];

    if (!arows?.length) {
      return { ok: false, error: "not_found", message: "Alias not found." };
    }

    const docId = arows[0].doc_id;

    const drows = (await sql`
      select id::text as id, title
      from docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as DocRow[];

    const docTitle = drows?.[0]?.title || "Document";

    const token = crypto.randomUUID();
    const expiresAt =
      expiresHours > 0 ? new Date(Date.now() + expiresHours * 3600 * 1000) : null;

    const passwordRequired = password.trim().length > 0;
    const passwordHash = passwordRequired ? await bcrypt.hash(password, 10) : null;

    const inserted = (await sql`
      insert into doc_shares (doc_id, to_email, token, expires_at, max_views, password_hash, password_set_at)
      values (
        ${docId}::uuid,
        ${to},
        ${token}::uuid,
        ${expiresAt ? expiresAt.toISOString() : null},
        ${Number.isFinite(maxViews) ? maxViews : null},
        ${passwordHash},
        ${passwordRequired ? new Date().toISOString() : null}
      )
      returning
        token::text as token,
        expires_at::text as expires_at,
        max_views,
        view_count
    `) as unknown as Array<{
      token: string;
      expires_at: string | null;
      max_views: number | null;
      view_count: number | null;
    }>;

    const row = inserted?.[0];
    const currentViews = Number(row?.view_count ?? 0);
    const maxViewsReturned =
      row?.max_views === null || row?.max_views === undefined ? null : Number(row.max_views);

    const site = envStr("NEXT_PUBLIC_SITE_URL", "https://www.cyang.io");
    const shareUrl = `${site.replace(/\/$/, "")}/s/${token}`;

    const brandName = envStr("BRAND_NAME", "Cyang Docs");
    const brandColor = envStr("BRAND_PRIMARY_COLOR", "#0B2A4A");
    const brandLogoUrl = process.env.BRAND_LOGO_URL || null;

    const maxViewsLabel =
      maxViewsReturned === null || maxViewsReturned === 0 ? "Unlimited" : String(maxViewsReturned);

    const viewsLeftLabel = computeViewsLeftLabel(currentViews, maxViewsReturned);

    await sendShareEmail({
      to,
      subject: `${brandName}: ${docTitle}`,
      brandName,
      brandColor,
      brandLogoUrl,

      docTitle,
      shareUrl,

      expiresAtLabel: expiresAt ? fmtDateLabel(expiresAt) : "No expiration",
      maxViewsLabel,
      currentViewsLabel: String(currentViews),
      viewsLeftLabel,

      // Optional: you could add a “Password required” line in your email template
      // but we won't email the actual password.
    });

    revalidatePath(`/d/${alias}`);

    return {
      ok: true,
      share_url: shareUrl,
      token,
      expires_at: row?.expires_at ?? (expiresAt ? expiresAt.toISOString() : null),
      max_views: maxViewsReturned,
      view_count: currentViews,
      views_left_label: viewsLeftLabel,
      password_required: passwordRequired,
    };
  } catch (e: any) {
    const msg = String(e?.message || "");
    return { ok: false, error: "server_error", message: msg || "Unknown error" };
  }
}
