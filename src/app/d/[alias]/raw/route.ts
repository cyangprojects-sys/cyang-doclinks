export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

type AliasRow = {
  doc_id: string;
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
  context: { params: Promise<{ alias: string }> }
) {
  const { alias } = await context.params;

  // 1) Resolve alias with expiration + revoke checks
  const rows = (await sql`
    select doc_id::text as doc_id
    from public.doc_aliases
    where alias = ${alias}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  `) as AliasRow[];

  const docId = rows?.[0]?.doc_id;
  if (!docId) return new NextResponse("Not found", { status: 404 });

  // 2) Analytics logging (best-effort)
  try {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const ua = req.headers.get("user-agent") || null;
    const ref = req.headers.get("referer") || null;

    await sql`
      insert into public.doc_views
        (doc_id, alias, path, kind, user_agent, referer, ip_hash)
      values
        (${docId}::uuid, ${alias}, ${new URL(req.url).pathname}, 'alias_raw', ${ua}, ${ref}, ${ipHash})
    `;
  } catch {
    // ignore logging errors
  }

  // 3) Redirect to serve route (which returns the PDF)
  const url = new URL(req.url);
  url.pathname = `/serve/${encodeURIComponent(docId)}`;
  url.search = ""; // keep clean

  return NextResponse.redirect(url, 307);
}
