import { sql } from "@/lib/db";
import { randomToken, hmacSha256Hex } from "@/lib/crypto";
import { sendSignInEmail } from "@/lib/resend";
import { NextRequest } from "next/server";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALIAS_RE = /^[a-z0-9][a-z0-9_-]{1,127}$/i;
const MAX_AUTH_EMAIL_START_FORM_BYTES = 8 * 1024;

function parseFormBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function requireAppUrl(): string {
  const appUrl = (process.env.APP_URL || "").trim();
  if (!appUrl) throw new Error("Missing APP_URL");
  return appUrl;
}

function escHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:auth_email_start",
    limit: Number(process.env.RATE_LIMIT_AUTH_EMAIL_START_IP_PER_MIN || 8),
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return new Response("Too many requests. Please try again shortly.", {
      status: rl.status,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }
  if (parseFormBodyLength(req) > MAX_AUTH_EMAIL_START_FORM_BYTES) {
    return new Response("Request body too large.", { status: 413 });
  }

  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const alias = String(form.get("alias") || "").trim();

  if (!email || !alias || !EMAIL_RE.test(email) || !ALIAS_RE.test(alias)) {
    return new Response("Missing or invalid email/alias", { status: 400 });
  }

  // Confirm alias exists/active (respond generically either way)
const ok = (await sql`
  select alias, is_active
  from document_aliases
  where alias = ${alias}
  limit 1
`) as { alias: string; is_active: boolean }[];

  if (ok.length === 0 || !ok[0].is_active) {
    return new Response("If the document exists, you will receive an email shortly.", { status: 200 });
  }

  const token = randomToken(32);
  const tokenHash = hmacSha256Hex(token);

  // 20 minute login token TTL
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

  await sql`
    insert into login_tokens (token_hash, email, alias, expires_at)
    values (${tokenHash}, ${email}, ${alias}, ${expiresAt.toISOString()})
  `;

  const link = `${requireAppUrl()}/auth/email/consume?t=${encodeURIComponent(token)}&alias=${encodeURIComponent(alias)}`;
  await sendSignInEmail(email, link);

  return new Response(
    `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
      <h2>Check your email</h2>
      <p>If <b>${escHtml(email)}</b> can receive mail, you’ll get a sign-in link shortly.</p>
      <p><a href="/d/${encodeURIComponent(alias)}">Back to document</a></p>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
