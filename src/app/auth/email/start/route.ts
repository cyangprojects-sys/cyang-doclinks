import { sql } from "@/lib/db";
import { randomToken, hmacSha256Hex } from "@/lib/crypto";
import { sendSignInEmail } from "@/lib/resend";

if (!process.env.APP_URL) throw new Error("Missing APP_URL");

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const alias = String(form.get("alias") || "").trim();

  if (!email || !alias) return new Response("Missing email or alias", { status: 400 });

  // Confirm alias exists/active (respond generically either way)
const ok = (await sql`
  select alias, is_active
  from doc_aliases
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

  const link = `${process.env.APP_URL}/auth/email/consume?t=${encodeURIComponent(token)}&alias=${encodeURIComponent(alias)}`;
  await sendSignInEmail(email, link);

  return new Response(
    `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
      <h2>Check your email</h2>
      <p>If <b>${email}</b> can receive mail, you’ll get a sign-in link shortly.</p>
      <p><a href="/d/${encodeURIComponent(alias)}">Back to document</a></p>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
