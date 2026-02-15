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

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
  const salt = process.env.VIEW_SALT || "";
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function safeFilename(name: string) {
  const cleaned = (name || "document.pdf").replace(/["\r\n]/g, "").trim();
  if (!cleaned) return "document.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

// Resolve token AND increment views atomically (race-safe).
async function resolveAndIncrementToken(token: string) {
  // If your share_tokens.token is uuid, this path works.
  if (isUuid(token)) {
    const rows = (await sql`
      update public.share_tokens st
      set views_count = st.views_count + 1
      where st.token = ${token}::uuid
        and st.revoked_at is null
        and (st.expires_at is null or st.expires_at > now())
        and (st.max_views is null or st.views_count < st.max_views)
      returning st.doc_id::text as doc_id
    `) as { doc_id: string }[];
    return rows[0]?.doc_id || null;
  }

  // If your share_tokens.token is text, this path works.
  const rows = (await sql`
    update public.share_tokens st
    set views_count = st.views_count + 1
    where st.token = ${token}
      and st.revoked_at is null
      and (st.expires_at is null or st.expires_at > now())
      and (st.max_views is null or st.views_count < st.max_views)
    returning st.doc_id::text as doc_id
  `) as { doc_id: string }[];

  return rows[0]?.doc_id || null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  // 1) enforce rules + increment views_count (atomic)
  const docId = await resolveAndIncrementToken(token);
  if (!docId) return new NextResponse("Not found", { status: 404 });

  // 2) load doc storage info (your repo uses public.docs with r2_bucket + r2_key)
  const docRows = (await sql`
    select
      r2_bucket::text as bucket,
      r2_key::text as key,
      coalesce(original_filename, title, 'document.pdf')::text as name,
      coalesce(content_type, 'application/pdf')::text as content_type
    from public.docs
    where id = ${docId}::uuid
    limit 1
  `) as {
    bucket: string | null;
    key: string | null;
    name: string;
    content_type: string;
  }[];

  if (!docRows.length || !docRows[0].bucket || !docRows[0].key) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bucket = docRows[0].bucket!;
  const key = docRows[0].key!;
  const filename = safeFilename(docRows[0].name);

  // 3) analytics log (best-effort)
  try {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const ua = req.headers.get("user-agent") || null;
    const ref = req.headers.get("referer") || null;

    await sql`
      insert into public.doc_views
        (doc_id, token, path, kind, user_agent, referer, ip_hash)
      values
        (${docId}::uuid, ${token}, ${new URL(req.url).pathname}, 'token_raw', ${ua}, ${ref}, ${ipHash})
    `;
  } catch {
    // ignore
  }

  // 4) stream from R2 with Range support
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

  headers.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${filename}"`
  );

  return new NextResponse(body as any, {
    status: range ? 206 : 200,
    headers,
  });
}
