export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ docId: string }> }
) {
  const { docId } = await ctx.params;

  const rows = (await sql`
    select r2_bucket, r2_key, content_type
    from documents
    where id = ${docId}::uuid
    limit 1
  `) as { r2_bucket: string; r2_key: string; content_type: string | null }[];

  if (!rows.length) return new Response("Not found", { status: 404 });

  const d = rows[0];

  // IMPORTANT: r2Client must be an S3Client instance (not a function)
  const url = await getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: d.r2_bucket,
      Key: d.r2_key,
      ResponseContentType: d.content_type ?? "application/pdf",
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: 60 * 5 }
  );

  return Response.redirect(url, 302);
}
