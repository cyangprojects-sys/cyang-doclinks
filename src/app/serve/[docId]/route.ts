export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

type DocRow = {
  r2_bucket: string | null;
  r2_key: string | null;
  content_type: string | null;
  title: string | null;
};

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
  const salt = process.env.VIEW_SALT || "";
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ docId: string }> }
) {
  const { docId } = await ctx.params;

  const rows = (await sql`
    select r2_bucket, r2_key, content_type, title
    from public.docs
    where id = ${docId}::uuid
      and coalesce(status, '') <> 'deleted'
    limit 1
  `) as DocRow[];

  const row = rows?.[0];
  if (!row?.r2_bucket || !row?.r2_key) {
    return new Response("Not found", { status: 404 });
  }

  // Analytics (best-effort)
  try {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const ua = req.headers.get("user-agent") || null;
    const ref = req.headers.get("referer") || null;

    await sql`
      insert into public.doc_views
        (doc_id, alias, path, kind, user_agent, referer, ip_hash)
      values
        (${docId}::uuid, null, ${new URL(req.url).pathname}, 'serve', ${ua}, ${ref}, ${ipHash})
    `;
  } catch {
    // ignore logging errors
  }

  const contentType = row.content_type || "application/pdf";
  const dispositionName = (row.title || "document").replace(/[\r\n"]/g, " ").slice(0, 120);

  const url = await getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: row.r2_bucket,
      Key: row.r2_key,
      ResponseContentType: contentType,
      ResponseContentDisposition: `inline; filename="${dispositionName}.pdf"`,
    }),
    { expiresIn: 60 * 5 }
  );

  return Response.redirect(url, 302);
}
