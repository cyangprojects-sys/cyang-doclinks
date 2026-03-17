import { sendHtmlEmail } from "@/lib/email";

const MAX_URL_LEN = 2048;

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const safeSignInUrl = normalizeSignInUrl(signInUrl);
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

  await sendHtmlEmail({
    to,
    subject,
    text,
    html,
    entityRefId: `signin-${Date.now()}`,
    tags: [
      { name: "template", value: "signin_link" },
      { name: "channel", value: "auth" },
    ],
  });
}
