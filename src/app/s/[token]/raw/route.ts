// src/app/s/[token]/raw/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import crypto from "crypto";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
  const salt = process.env.VIEW_SALT || process.env.SHARE_SALT || "";
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function safeFilename(name: string) {
  const cleaned = (name || "document.pdf").replace(/["\r\n]/g, "").trim();
  if (!cleaned) return "document.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function cookieName(token: string) {
  return `share_unlock_${token}`;
}

async function isUnlocked(token: string, req: NextRequest): Promise<boolean> {
  const unlockId = req.cookies.get(cookieName(token))?.value || "";
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

function isExpired(expires_at: string | null) {
  if (!expires_at) return false;
  return new Date(expires_at).getTime() <= Date.now();
}

function isMaxed(view_count: number, max_views: number | null) {
  if (max_views === null) return false;
  if (max_views === 0) return false;
  return view_count >= max_views;
}

/**
 * Resolve token + increment views atomically while enforcing rules.
 * Supports doc_shares OR share_tokens.
 */
async function resolveAndIncrement(token: string): Promise<
  | {
    ok: true;
    table: "doc_shares" | "share_tokens";
    doc_id: string;
    password_hash: string | null;
  }
  | { ok: false }
> {
  // doc_shares (view_count)
  try {
    const rows = (await sql`
      update public.doc_shares s
      set view_count = s.view_count + 1
      where s.token = ${token}
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
        and (s.max_views is null or s.max_views = 0 or s.view_count < s.max_views)
      returning s.doc_id::text as doc_id, s.password_hash
    `) as unknown as Array<{ doc_id: string; password_hash: string | null }>;

    if (rows?.length) return { ok: true, table: "doc_shares", doc_id: rows[0].doc_id, password_hash: rows[0].password_hash };
  } catch {
    // ignore table missing
  }

  // share_tokens (views_count)
  try {
    const rows = (await sql`
      update public.share_tokens st
      set views_count = st.views_count + 1
      where (st.token::text = ${token} or st.token = ${token})
        and st.revoked_at is null
        and (st.expires_at is null or st.expires_at > now())
        and (st.max_views is null or st.max_views = 0 or st.views_count < st.max_views)
      returning st.doc_id::text as doc_id, st.password_hash
    `) as unknown as Array<{ doc_id: string; password_hash: string | null }>;

    if (rows?.length) return { ok: true, table: "share_tokens", doc_id: rows[0].doc_id, password_hash: rows[0].password_hash };
  } catch {
    // ignore
  }

  return { ok: false };
}

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const t = (token || "").trim();
  if (!t) return new NextResponse("Not found", { status: 404 });

  // 1) We need share meta BEFORE we stream so we can enforce password if set.
  // We also increment views atomically here (your existing behavior).
  const resolved = await resolveAndIncrement(t);
  if (!resolved.ok) return new NextResponse("Not found", { status: 404 });

  // 2) If password is set, require unlocked cookie+DB
  if (resolved.password_hash) {
    const ok = await isUnlocked(t, req);
    if (!ok) {
      // Don’t stream if locked
      return NextResponse.redirect(new URL(`/s/${encodeURIComponent(t)}`, req.url), 302);
    }
  }

  // 3) Load doc storage info (docs with r2_bucket + r2_key)
  const docRows = (await sql`
    select
      r2_bucket::text as bucket,
      r2_key::text as key,
      coalesce(original_filename, title, 'document.pdf')::text as name,
      coalesce(content_type, 'application/pdf')::text as content_type
    from public.docs
    where id = ${resolved.doc_id}::uuid
    limit 1
  `) as unknown as Array<{
    bucket: string | null;
    key: string | null;
    name: string;
    content_type: string;
  }>;

  if (!docRows.length || !docRows[0].bucket || !docRows[0].key) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bucket = docRows[0].bucket!;
  const key = docRows[0].key!;
  const filename = safeFilename(docRows[0].name);

  // 4) Analytics log (best-effort)
  try {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const ua = req.headers.get("user-agent") || null;
    const ref = req.headers.get("referer") || null;

    await sql`
      insert into public.doc_views
        (doc_id, token, path, kind, user_agent, referer, ip_hash)
      values
        (${resolved.doc_id}::uuid, ${t}, ${new URL(req.url).pathname}, 'share_raw', ${ua}, ${ref}, ${ipHash})
    `;
  } catch {
    // ignore
  }

  // 5) Stream from R2 with Range support
  const range = req.headers.get("range") ?? undefined;

  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: range,
    })
  );

  const body = obj.Body as Readable | undefined;
  if (!body) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  const headers = new Headers();
  headers.set("Content-Type", obj.ContentType || docRows[0].content_type || "application/pdf");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");

  const contentRange = (obj as any).ContentRange as string | undefined;
  if (contentRange) headers.set("Content-Range", contentRange);
  if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));

  headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);

  return new NextResponse(body as any, {
    status: range ? 206 : 200,
    headers,
  });
}
