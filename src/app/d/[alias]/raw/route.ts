export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

function pickFilename(title: string | null, fallback: string) {
  const base = (title || fallback).trim() || fallback;
  return base.replace(/[^\w.\- ]+/g, "_");
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ alias: string }> }
): Promise<Response> {
  const { alias: rawAlias } = await ctx.params;
  const alias = String(rawAlias || "").trim();

  if (!alias) {
    return new Response("Missing alias", { status: 400 });
  }

  // Resolve alias -> doc storage pointer
  const rows = (await sql`
    select
      d.id::text as id,
      d.title::text as title,
      d.bucket::text as bucket,
      d.r2_key::text as r2_key,
      d.content_type::text as content_type
    from docs d
    join doc_aliases a on a.doc_id = d.id
    where a.alias = ${alias}
    limit 1
  `) as unknown as {
    id: string;
    title: string | null;
    bucket: string;
    r2_key: string;
    content_type: string | null;
  }[];

  if (!rows || rows.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const doc = rows[0];

  if (!doc.bucket || !doc.r2_key) {
    return new Response("Document storage pointer missing", { status: 500 });
  }

  const client = r2Client;

  const obj = await client.send(
    new GetObjectCommand({
      Bucket: doc.bucket,
      Key: doc.r2_key,
    })
  );

  if (!obj.Body) {
    return new Response("Object body missing", { status: 500 });
  }

  const filename = pickFilename(doc.title, alias) + ".pdf";
  const contentType = doc.content_type || "application/pdf";

  return new Response(obj.Body as any, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
