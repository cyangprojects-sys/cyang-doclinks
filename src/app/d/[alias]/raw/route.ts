export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // e.g. https://<accountid>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function parseTargetUrl(targetUrl: string): { bucket: string; key: string } {
  // Accept: r2://bucket/key
  if (targetUrl.startsWith("r2://")) {
    const rest = targetUrl.slice("r2://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) throw new Error("Invalid r2:// url");
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }

  // Accept: https://.../bucket/key
  if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
    const u = new URL(targetUrl);
    const parts = u.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) throw new Error("Invalid http(s) target_url");
    return { bucket: parts[0], key: parts.slice(1).join("/") };
  }

  // Accept: bucket/key
  const parts = targetUrl.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid target_url");
  return { bucket: parts[0], key: parts.slice(1).join("/") };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ alias: string }> }
) {
  const { alias: rawAlias } = await context.params;
  const alias = decodeURIComponent(rawAlias).toLowerCase();

  // alias -> doc_id (active)
  const aliasRows = (await sql`
    select doc_id::text as doc_id, is_active
    from doc_aliases
    where alias = ${alias}
    limit 1
  `) as { doc_id: string; is_active: boolean }[];

  if (!aliasRows.length || !aliasRows[0].is_active) {
    return new NextResponse("Not found", { status: 404 });
  }

  const docId = aliasRows[0].doc_id;

  // doc_id -> target_url + filename
  const docRows = (await sql`
    select target_url, coalesce(original_filename, title, 'document.pdf') as name
    from documents
    where id = ${docId}::uuid
    limit 1
  `) as { target_url: string; name: string }[];

  if (!docRows.length || !docRows[0].target_url) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { bucket, key } = parseTargetUrl(docRows[0].target_url);
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
  const filename = docRows[0].name.endsWith(".pdf") ? docRows[0].name : `${docRows[0].name}.pdf`;

  const headers = new Headers();
  headers.set("Content-Type", obj.ContentType || "application/pdf");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");

  // Range support (important for PDF seeking)
  const contentRange = (obj as any).ContentRange as string | undefined;
  if (contentRange) headers.set("Content-Range", contentRange);

  // Content length
  if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));

  headers.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${filename.replace(/"/g, "")}"`
  );

  return new NextResponse(body as any, {
    status: range ? 206 : 200,
    headers,
  });
}
