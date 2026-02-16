// src/app/d/[alias]/raw/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import crypto from "crypto";

type ResolvedRow = {
  doc_id: string;
  is_public: boolean;
};

type ShareConsumeRow = { ok: boolean };

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
  const salt = process.env.VIEW_SALT || "";
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

async function resolveDoc(alias: string): Promise<ResolvedRow | null> {
  const rows = (await sql`
    select
      d.id::text as doc_id,
      d.is_public as is_public
    from public.doc_aliases a
    join public.docs d on d.id = a.doc_id
    where a.alias = ${alias}
      and a.revoked_at is null
      and (a.expires_at is null or a.expires_at > now())
    limit 1
  `) as ResolvedRow[];

  return rows?.[0] || null;
}

// Atomically increments view_count only if still allowed.
// max_views semantics:
// - NULL => unlimited
// - 0    => unlimited
// - N>0  => allow N total views; we increment only if view_count < N
async function consumeViewIfAllowed(docId: string, token: string): Promise<boolean> {
  const rows = (await sql`
    update public.doc_shares s
    set view_count = s.view_count + 1
    where s.doc_id = ${docId}::uuid
      and s.token = ${token}
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.max_views is null
        or s.max_views = 0
        or s.view_count < s.max_views
      )
    returning true as ok
  `) as ShareConsumeRow[];

  return !!rows?.[0]?.ok;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ alias: string }> }
) {
  const { alias: rawAlias } = await context.params;
  const alias = decodeURIComponent(rawAlias || "").trim();
  if (!alias) return new NextResponse("Not found", { status: 404 });

  const resolved = await resolveDoc(alias);
  const docId = resolved?.doc_id;
  if (!docId) return new NextResponse("Not found", { status: 404 });

  // Gate: allow public docs, otherwise require valid share token cookie
  let allowed = !!resolved?.is_public;

  if (!allowed) {
    const token = req.cookies.get("cyang_share")?.value || "";
    if (token) {
      allowed = await consumeViewIfAllowed(docId, token);
    }
  }

  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
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
        (${docId}::uuid, ${alias}, ${new URL(req.url).pathname}, 'alias_raw', ${ua}, ${ref}, ${ipHash})
    `;
  } catch {
    // ignore logging errors
  }

  // Redirect to serve route
  const url = new URL(req.url);
  url.pathname = `/serve/${encodeURIComponent(docId)}`;
  url.search = "";

  return NextResponse.redirect(url, 307);
}
