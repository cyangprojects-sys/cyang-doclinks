export const runtime = "nodejs";

import { sql } from "@/lib/db";
import { hmacSha256Hex, signPayload } from "@/lib/crypto";

if (!process.env.APP_SECRET) throw new Error("Missing APP_SECRET");

type LoginTokenRow = {
  id: number;
  email: string;
  alias: string;
  expires_at: string;
  use_count?: number | null;
  max_uses?: number | null;
  revoked_at?: string | null;
};

type AliasRow = { doc_id: string; is_active: boolean };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") || "").trim();
  const alias = (url.searchParams.get("alias") || "").trim();

  if (!token || !alias) {
    return new Response("Bad request", { status: 400 });
  }

  // 1) Resolve alias -> doc_id, ensure active
  const aliasRows = (await sql`
    select doc_id, is_active
    from doc_aliases
    where alias = ${alias}
    limit 1
  `) as AliasRow[];

  if (aliasRows.length === 0 || !aliasRows[0].is_active) {
    return new Response("Not found", { status: 404 });
  }

  const docId = aliasRows[0].doc_id;

  // 2) Validate login token
  const tokenHash = hmacSha256Hex(token);

  const tokenRows = (await sql`
    select id, email, alias, expires_at, use_count, max_uses, revoked_at
    from login_tokens
    where token_hash = ${tokenHash}
      and alias = ${alias}
    limit 1
  `) as LoginTokenRow[];

  if (tokenRows.length === 0) {
    return new Response("Invalid or expired link", { status: 400 });
  }

  const lt = tokenRows[0];

  if (lt.revoked_at) return new Response("Link revoked", { status: 400 });
  if (new Date(lt.expires_at).getTime() <= Date.now()) {
    return new Response("Link expired", { status: 400 });
  }

  // handle schemas that may not have max_uses/use_count yet
  const useCount = lt.use_count ?? 0;
  const maxUses = lt.max_uses ?? 1;
  if (useCount >= maxUses) return new Response("Link already used", { status: 400 });

  // 3) Find an active grant for this (doc_id, email) or create a new one
  const grants = (await sql`
    select id, expires_at, revoked_at
    from doc_access_grants
    where doc_id = ${docId}
      and email = ${lt.email}
      and revoked_at is null
    order by id desc
    limit 1
  `) as { id: number; expires_at: string; revoked_at: string | null }[];

  let grantId: number;

  if (grants.length && new Date(grants[0].expires_at).getTime() > Date.now()) {
    grantId = grants[0].id;
  } else {
    const grantExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    const inserted = (await sql`
      insert into doc_access_grants (doc_id, email, expires_at)
      values (${docId}, ${lt.email}, ${grantExpiresAt.toISOString()})
      returning id
    `) as { id: number }[];

    grantId = inserted[0].id;
  }

  // 4) Mark token used (prevents replay)
  await sql`
    update login_tokens
    set use_count = coalesce(use_count, 0) + 1
    where id = ${lt.id}
  `;

  // 5) Set cookie session (grant-based)
  const exp = Math.floor(Date.now() / 1000) + 8 * 60 * 60; // 8 hours
  const signed = signPayload({ grant_id: grantId, exp });

  const isProd = process.env.NODE_ENV === "production";
  const cookie = [
    `cy_doc_session=${signed}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${8 * 60 * 60}`,
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  // 6) Redirect back to viewer page
  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie": cookie,
      Location: `/d/${encodeURIComponent(alias)}`,
    },
  });
}
