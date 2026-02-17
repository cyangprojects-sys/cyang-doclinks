export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getOwnerOrNull } from "@/lib/owner";

export async function GET(req: Request, ctx: { params: Promise<{ alias: string }> }) {
  const { alias } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  // Resolve alias -> doc pointer
  const rows = await sql<{
    id: string;
    title: string | null;
    bucket: string;
    r2_key: string;
    content_type: string | null;
  }[]>`
    select
      d.id::text as id,
      d.title,
      d.bucket,
      d.r2_key,
      d.content_type
    from doc_aliases da
    join docs d on d.id = da.doc_id
    where da.alias = ${alias}
    limit 1
  `;

  const doc = (rows as any)[0];
  if (!doc) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Allow if owner
  const owner = await getOwnerOrNull();
  let allowed = !!owner;

  // Or allow if token is valid
  if (!allowed && token) {
    const tRows = await sql<{
      token: string;
      expires_at: string | null;
      max_views: number | null;
      view_count: number;
      revoked_at: string | null;
    }[]>`
      select
        token,
        expires_at::text as expires_at,
        max_views,
        view_count,
        revoked_at::text as revoked_at
      from share_tokens
      where token = ${token}
        and doc_id = ${doc.id}::uuid
      limit 1
    `;

    const t = (tRows as any)[0];
    if (t) {
      const now = Date.now();
      const expOk = !t.expires_at || new Date(t.expires_at).getTime() > now;
      const notRevoked = !t.revoked_at;
      const viewsOk = t.max_views == null || t.view_count < t.max_views;

      allowed = expOk && notRevoked && viewsOk;

      if (allowed) {
        // increment view_count and record a view (best-effort)
        try {
          await sql`
            update share_tokens
            set view_count = view_count + 1
            where token = ${token}
          `;
        } catch { }

        try {
          await sql`
            insert into share_views (token, viewed_at, ip)
            values (${token}, now(), ${req.headers.get("x-forwarded-for") || null})
          `;
        } catch { }
      }
    }
  }

  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Fetch from R2
  const client = r2Client;
  const obj = await client.send(
    new GetObjectCommand({
      Bucket: doc.bucket,
      Key: doc.r2_key,
    })
  );

  const stream = obj.Body as any; // Readable
  const contentType = doc.content_type || "application/pdf";

  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      // inline lets the iframe preview work
      "Content-Disposition": `inline; filename="${(doc.title || alias).replace(/"/g, "")}.pdf"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
