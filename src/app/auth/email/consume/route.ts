import { sql } from "@/lib/db";
import { cookieHeader } from "@/lib/cookies";
import { hmacSha256Hex, signPayload } from "@/lib/crypto";

type DocSession = { grant_id: number; exp: number };

type LoginTokenRow = {
  id: number;
  email: string;
  expires_at: string;
  use_count: number;
  max_uses: number;
  revoked_at: string | null;
  alias: string;
};

type DocAliasRow = { doc_id: string; is_active: boolean };
type GrantRow = { id: number };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") || "").trim();
  const alias = (url.searchParams.get("alias") || "").trim();

  if (!token || !alias) return new Response("Bad request", { status: 400 });

  const tokenHash = hmacSha256Hex(token);

const rows = await (sql<LoginTokenRow[]>`
  select id, email, expires_at, use_count, max_uses, revoked_at, alias
  from login_tokens
  where token_hash = ${tokenHash}
  limit 1
` as unknown as Promise<LoginTokenRow[]>);

  if (rows.length === 0) return new Response("This sign-in link is invalid or expired.", { status: 400 });

  const t = rows[0];
  if (t.revoked_at) return new Response("This sign-in link is no longer valid.", { status: 400 });
  if (t.alias !== alias) return new Response("This sign-in link does not match the document.", { status: 400 });
  if (new Date(t.expires_at).getTime() <= Date.now()) return new Response("This sign-in link has expired.", { status: 400 });
  if (t.use_count >= t.max_uses) return new Response("This sign-in link has already been used.", { status: 400 });

  // Mark token used
  await sql`
    update login_tokens
    set use_count = use_count + 1
    where id = ${t.id}
  `;

  // Resolve alias -> doc_id
 const docs = (await sql`
  select doc_id, is_active
  from document_aliases
  where alias = ${alias}
  limit 1
`) as { doc_id: string; is_active: boolean }[];
  if (docs.length === 0 || !docs[0].is_active) return new Response("Document not found.", { status: 404 });

  const docId = docs[0].doc_id;

  // Create doc-only access grant (8 hours)
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
 const grantRows = await (sql<GrantRow[]>`
  insert into doc_access_grants (doc_id, principal, provider, expires_at)
  values (${docId}, ${t.email}, 'email', ${expiresAt.toISOString()})
  returning id
` as unknown as Promise<GrantRow[]>);


  const grantId = grantRows[0].id;
  const expUnix = Math.floor(expiresAt.getTime() / 1000);

  const signed = signPayload<DocSession>({ grant_id: grantId, exp: expUnix });

  const headers = new Headers();
  headers.append("Set-Cookie", cookieHeader("cy_doc_session", signed, { maxAgeSeconds: 8 * 60 * 60 }));
  headers.set("Location", `/d/${encodeURIComponent(alias)}`);

  return new Response(null, { status: 302, headers });
}
