export const runtime = "nodejs";

import { sql } from "@/lib/db";
import { cookieHeader, getCookie, shouldUseSecureCookies } from "@/lib/cookies";
import { signPayload } from "@/lib/crypto";
import { exchangeGoogleCode } from "@/lib/oauth-google";
import { NextRequest } from "next/server";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

const ALIAS_RE = /^[a-z0-9][a-z0-9_-]{1,127}$/i;

type DocSession = { grant_id: number; exp: number };

type AliasLookupRow = { doc_id: string; target_url: string; is_active: boolean };
type GrantRow = { id: number };

function clearCookie(headers: Headers, name: string) {
  const secure = shouldUseSecureCookies() ? "; Secure" : "";
  headers.append("Set-Cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:auth_google_callback",
    limit: Number(process.env.RATE_LIMIT_AUTH_GOOGLE_CALLBACK_IP_PER_MIN || 40),
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return new Response("Too many requests. Please try again shortly.", {
      status: rl.status,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const alias = (getCookie(req, "cy_oauth_alias") || "").trim();
  const codeVerifier = (getCookie(req, "cy_oauth_cv") || "").trim();
  const expectedState = (getCookie(req, "cy_oauth_state") || "").trim();
  const expectedNonce = (getCookie(req, "cy_oauth_nonce") || "").trim();

  const headers = new Headers();
  // Clear oauth cookies no matter what
  clearCookie(headers, "cy_oauth_alias");
  clearCookie(headers, "cy_oauth_cv");
  clearCookie(headers, "cy_oauth_state");
  clearCookie(headers, "cy_oauth_nonce");

  if (!alias || !ALIAS_RE.test(alias) || !codeVerifier || !expectedState || !expectedNonce) {
    // Missing checks => restart sign-in
    headers.set("Location", alias ? `/d/${encodeURIComponent(alias)}` : "/");
    return new Response(null, { status: 302, headers });
  }

  // 1) Exchange code for tokens + validate (state/nonce/PKCE)
  let claims: { email?: string; email_verified?: boolean } | undefined;
  try {
    const exchanged = await exchangeGoogleCode(req, {
      codeVerifier,
      state: expectedState,
      nonce: expectedNonce,
    });
    claims = exchanged.claims as { email?: string; email_verified?: boolean } | undefined;
  } catch {
    headers.set("Location", `/d/${encodeURIComponent(alias)}`);
    return new Response(null, { status: 302, headers });
  }

  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : "";
  const emailVerified = claims?.email_verified === true;

  if (!email || !emailVerified) {
    headers.set("Location", `/d/${encodeURIComponent(alias)}`);
    return new Response(null, { status: 302, headers });
  }


  // 2) Look up alias -> doc_id + target_url + is_active
  const rows = (await sql`
    select a.doc_id, d.target_url, a.is_active
    from document_aliases a
    join documents d on d.id = a.doc_id
    where a.alias = ${alias}
    limit 1
  `) as AliasLookupRow[];

  if (rows.length === 0 || !rows[0].is_active) {
    headers.set("Location", `/d/${encodeURIComponent(alias)}`);
    return new Response(null, { status: 302, headers });
  }

  const docId = rows[0].doc_id;

  // 3) Create doc-only access grant (8 hours)
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const grantRows = (await sql`
    insert into doc_access_grants (doc_id, principal, provider, expires_at)
    values (${docId}, ${email}, 'google', ${expiresAt.toISOString()})
    returning id
  `) as GrantRow[];

  const grantId = grantRows[0]?.id;
  if (!grantId) {
    headers.set("Location", `/d/${encodeURIComponent(alias)}`);
    return new Response(null, { status: 302, headers });
  }

  // 4) Set your doc session cookie and redirect back to the doc
  const expUnix = Math.floor(expiresAt.getTime() / 1000);
  const signed = signPayload({ grant_id: grantId, exp: expUnix } satisfies DocSession);

  headers.append(
    "Set-Cookie",
    cookieHeader("cy_doc_session", signed, { maxAgeSeconds: 8 * 60 * 60 })
  );
  headers.set("Location", `/d/${encodeURIComponent(alias)}`);

  return new Response(null, { status: 302, headers });
}
