export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

function parseR2Pointer(pointer: string): { bucket: string; key: string } | null {
  // pointer format: r2://bucket-name/path/to/file.pdf
  if (!pointer?.startsWith("r2://")) return null;
  const rest = pointer.slice("r2://".length);
  const idx = rest.indexOf("/");
  if (idx <= 0) return null;
  const bucket = rest.slice(0, idx);
  const key = rest.slice(idx + 1);
  if (!bucket || !key) return null;
  return { bucket, key };
}

function sanitizeDownloadName(name: string) {
  return (name || "document.pdf").replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const doc = (url.searchParams.get("doc") || "").trim();
  if (!doc) return new Response("Bad request", { status: 400 });

  // Look up where the doc lives
  const rows = await sql<{ target_url: string; title: string }[]>`
    select target_url, title
    from documents
    where id = ${doc}::uuid
    limit 1
  `;
  const row = rows[0];
  if (!row?.target_url) return new Response("Not found", { status: 404 });

  const parsed = parseR2Pointer(row.target_url);
  if (!parsed) return new Response("Bad target_url", { status: 500 });

  const client = r2Client();

  const obj = await client.send(
    new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    })
  );

  // obj.Body is a ReadableStream (in node runtime)
  const body = obj.Body as any;

  const filename = sanitizeDownloadName(row.title || "document.pdf");
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${filename.endsWith(".pdf") ? filename : filename + ".pdf"}"`);

  // Some PDFs benefit from caching disabled while testing
  headers.set("Cache-Control", "no-store");

  return new Response(body, { status: 200, headers });
}
