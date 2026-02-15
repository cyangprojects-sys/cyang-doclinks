export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function parseR2Url(u: string): { bucket: string; key: string } | null {
  // r2://bucket/key...
  if (!u || !u.startsWith("r2://")) return null;
  const rest = u.slice("r2://".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ docId: string }> }
) {
  const { docId } = await ctx.params;

  const rows = (await sql`
    select target_url
    from documents
    where id = ${docId}::uuid
    limit 1
  `) as { target_url: string | null }[];

  if (!rows.length || !rows[0].target_url) {
    return new Response("Not found", { status: 404 });
  }

  const parsed = parseR2Url(rows[0].target_url);
  if (!parsed) return new Response("Invalid target_url", { status: 500 });

  const url = await getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: 60 * 5 }
  );

  return Response.redirect(url, 302);
}
