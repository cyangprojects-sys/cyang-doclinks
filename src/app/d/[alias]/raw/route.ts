export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

type AliasRow = {
  doc_id: string;
};

function hmacHex(key: string, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

export async function GET(req: NextRequest, ctx: { params: { alias: string } }) {
  const alias = ctx.params.alias;

  // 1) Resolve alias with expiration + revoke checks
  const rows = (await sql`
    select doc_id::text as doc_id
    from doc_aliases
    where alias = ${alias}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  `) as AliasRow[];

  const docId = rows?.[0]?.doc_id;
  if (!docId) {
    return new NextResponse("Not found", { status: 404 });
  }

  // 2) Analytics logging
  // Vercel/Edge headers usually include x-forwarded-for
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0]?.trim() || ""; // best-effort
  const ua = req.headers.get("user-agent") || "";
  const ref = req.headers.get("referer") || "";

  // Hash IP for privacy (recommended) — requires VIEW_SALT
  const salt = process.env.VIEW_SALT || "";
  const ip_hash = salt && ip ? hmacHex(salt, ip).slice(0, 32) : null;

  // Swallow logging errors so viewing never fails
  try {
    await sql`
      insert into doc_views (doc_id, alias, ip_hash, user_agent, referer)
      values (${docId}::uuid, ${alias}, ${ip_hash}, ${ua}, ${ref})
    `;
  } catch {
    // ignore
  }

  // 3) Redirect to your actual file-serving endpoint
  const url = new URL(req.url);
  url.pathname = `/serve/${encodeURIComponent(docId)}`;
  url.search = ""; // keep clean; if you want passthrough, remove this line

  return NextResponse.redirect(url, 307);
}
