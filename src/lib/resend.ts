const MAX_ENV_VALUE_LEN = 512;
const MAX_EMAIL_LEN = 320;
const MAX_URL_LEN = 2048;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireEnv(name: "RESEND_API_KEY" | "EMAIL_FROM"): string {
  const raw = String(process.env[name] || "");
  if (!raw || raw.length > MAX_ENV_VALUE_LEN || /[\r\n\0]/.test(raw)) throw new Error(`Missing ${name}`);
  const value = raw.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeRecipientEmail(value: string): string {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || /[\r\n\0]/.test(email)) {
    throw new Error("INVALID_EMAIL_TO");
  }
  if (!BASIC_EMAIL_RE.test(email)) throw new Error("INVALID_EMAIL_TO");
  return email;
}

function normalizeSignInUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_URL_LEN || /[\r\n\0]/.test(raw)) throw new Error("INVALID_SIGNIN_URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("INVALID_SIGNIN_URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("INVALID_SIGNIN_URL");
  if (url.username || url.password) throw new Error("INVALID_SIGNIN_URL");
  return url.toString();
}

export async function sendSignInEmail(to: string, signInUrl: string) {
  const recipient = normalizeRecipientEmail(to);
  const safeSignInUrl = normalizeSignInUrl(signInUrl);
  const resendApiKey = requireEnv("RESEND_API_KEY");
  const emailFrom = requireEnv("EMAIL_FROM");
  const subject = "Sign in to view your document";

  const text =
    `Click the link below to sign in and access your document:\n\n` +
    `${safeSignInUrl}\n\n` +
    `This link expires soon and can only be used once.\n`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Click the link below to sign in and access your document:</p>
      <p><a href="${esc(safeSignInUrl)}">${esc(safeSignInUrl)}</a></p>
      <p style="color:#666;font-size:12px">This link expires soon and can only be used once.</p>
    </div>
  `;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      // Optional but often helpful for auth links:
      "X-Entity-Ref-ID": `signin-${Date.now()}`,
    },
    body: JSON.stringify({
      from: emailFrom, // "DocLinks <login@cyang.io>"
      to: recipient,
      subject,
      text,
      html,
      // Optional but can help reduce no-reply spam scoring:
      reply_to: emailFrom,
      headers: {
        // Helps some clients show a single thread per sign-in attempt:
        "X-Auto-Response-Suppress": "All",
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend error: ${resp.status} ${text}`);
  }
}
