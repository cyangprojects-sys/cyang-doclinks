// src/app/d/[alias]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCookie } from "@/lib/cookies";
import { verifySignedPayload } from "@/lib/crypto";

type DocSession = { grant_id: number; exp: number };

function signInPage(alias: string) {
  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sign in</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
  <h2>Sign in to view this document</h2>

  <div style="margin:16px 0">
    <a href="/auth/google/start?alias=${encodeURIComponent(alias)}"
       style="display:inline-block;padding:10px 14px;border:1px solid #ccc;border-radius:8px;text-decoration:none">
       Continue with Google
    </a>
  </div>

  <hr style="margin:20px 0" />

  <form method="POST" action="/auth/email/start">
    <input type="hidden" name="alias" value="${alias}" />
    <label>Email address</label><br/>
    <input name="email" type="email" required
      style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin:8px 0" />
    <button type="submit"
      style="padding:10px 14px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer">
      Email me a sign-in link
    </button>
  </form>

  <p style="color:#666;font-size:12px;margin-top:18px">
    Access is granted for this document only and expires after 8 hours.
  </p>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ alias: string }> }) {
  const { alias } = await ctx.params;

  // 1) Look up alias -> doc_id + target_url
  const rows = (await sql`
    select a.doc_id, d.target_url, a.is_active
    from document_aliases a
    join documents d on d.id = a.doc_id
    where a.alias = ${alias}
    limit 1
  `) as { doc_id: string; target_url: string; is_active: boolean }[];

  if (rows.length === 0 || !rows[0].is_active) {
    return new Response("Not found", { status: 404 });
  }

  // 2) If cookie missing or invalid -> show sign-in page
  const raw = getCookie(req, "cy_doc_session");
  if (!raw) return signInPage(alias);

  const session = verifySignedPayload(raw) as DocSession | null;
  if (!session) return signInPage(alias);

  const now = Math.floor(Date.now() / 1000);
  if (session.exp <= now) return signInPage(alias);

  // 3) Validate grant in DB is valid and matches this doc
  const grants = (await sql`
    select id, doc_id, expires_at, revoked_at
    from doc_access_grants
    where id = ${session.grant_id}
    limit 1
  `) as { id: number; doc_id: string; expires_at: string; revoked_at: string | null }[];

  if (grants.length === 0) return signInPage(alias);

  const g = grants[0];
  if (g.revoked_at) return signInPage(alias);
  if (g.doc_id !== rows[0].doc_id) return signInPage(alias);
  if (new Date(g.expires_at).getTime() <= Date.now()) return signInPage(alias);

  // 4) Authorized -> redirect to a HTTPS serve route (NOT r2://)
  return Response.redirect(`/serve/${encodeURIComponent(rows[0].doc_id)}`, 302);
}
