// src/app/serve/[docId]/route.ts
export const runtime = "nodejs";

import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ docId: string }> }
) {
  const { docId } = await ctx.params;

  const rows = await sql`
    select target_url
    from documents
    where id = ${docId}
    limit 1
  `;

  if (rows.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const target = rows[0].target_url as string;

  if (!target.startsWith("r2://")) {
    // fallback for external URLs
    return Response.redirect(target, 302);
  }

  // Parse r2://bucket/key
  const [, bucket, ...keyParts] = target.replace("r2://", "").split("/");
  const key = keyParts.join("/");

  const obj = await r2Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  return new Response(obj.Body as any, {
    headers: {
      "Content-Type": obj.ContentType ?? "application/pdf",
      "Content-Disposition": "inline",
    },
  });
}
