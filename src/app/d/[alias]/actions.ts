"use server";

import { sql } from "@/lib/db";
import { randomBytes } from "node:crypto";

function makeToken() {
  // 24 bytes -> 32 chars-ish base64url, URL-safe
  return randomBytes(24).toString("base64url");
}

export type CreateShareTokenOpts = {
  days?: number;      // expires in N days (optional)
  maxViews?: number;  // max views allowed (optional)
};

export type CreateShareTokenResult =
  | { ok: true; token: string; url: string; expires_at: string | null; max_views: number | null }
  | { ok: false; error: string; message?: string };

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

    // Insert token (TEXT token) for this doc
    const rows = (await sql`
      insert into public.share_tokens (token, doc_id, expires_at, max_views, views_count)
      values (${token}, ${docId}::uuid, ${expiresAt}, ${maxViews}, 0)
      returning
        token::text as token,
        expires_at::text as expires_at,
        max_views
    `) as { token: string; expires_at: string | null; max_views: number | null }[];

    const created = rows?.[0];
    if (!created?.token) return { ok: false, error: "db_insert_failed" };

    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    return {
      ok: true,
      token: created.token,
      url: `${base}/s/${encodeURIComponent(created.token)}`,
      expires_at: created.expires_at,
      max_views: created.max_views,
    };
  } catch (e: any) {
    return { ok: false, error: "server_error", message: e?.message || "Failed to create token" };
  }
}
