// src/lib/email.ts
import { Resend } from "resend";

const MAX_ENV_VALUE_LEN = 512;
const MAX_EMAIL_LEN = 320;
const MAX_SUBJECT_LEN = 200;
const MAX_TEXT_LEN = 12000;
const MAX_URL_LEN = 2048;
const SAFE_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mustEnv(name: string) {
  const raw = String(process.env[name] || "");
  if (!raw) throw new Error(`Missing env: ${name}`);
  if (raw.length > MAX_ENV_VALUE_LEN || /[\r\n\0]/.test(raw)) throw new Error(`Missing env: ${name}`);
  const v = raw.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalizeRecipientEmail(value: string): string {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || /[\r\n\0]/.test(email)) {
    throw new Error("INVALID_EMAIL_TO");
  }
  if (!BASIC_EMAIL_RE.test(email)) throw new Error("INVALID_EMAIL_TO");
  return email;
}

function normalizeSubject(value: string): string {
  const subject = String(value || "").trim();
  if (!subject || subject.length > MAX_SUBJECT_LEN || /[\r\n\0]/.test(subject)) {
    throw new Error("INVALID_EMAIL_SUBJECT");
  }
  return subject;
}

function normalizePlainText(value: string): string {
  const text = String(value || "").trim();
  if (!text || text.length > MAX_TEXT_LEN || /[\0]/.test(text)) {
    throw new Error("INVALID_EMAIL_TEXT");
  }
  return text;
}

function normalizeHttpUrl(value: string, fieldName: "shareUrl" | "activationUrl" | "brandLogoUrl"): string {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_URL_LEN || /[\r\n\0]/.test(raw)) {
    throw new Error(`INVALID_${fieldName.toUpperCase()}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`INVALID_${fieldName.toUpperCase()}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`INVALID_${fieldName.toUpperCase()}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`INVALID_${fieldName.toUpperCase()}`);
  }
  return parsed.toString();
}

function normalizeOptionalHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return normalizeHttpUrl(value, "brandLogoUrl");
  } catch {
    return null;
  }
}

function normalizeBrandColor(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "#0B2A4A";
  if (SAFE_COLOR_RE.test(raw)) return raw;
  return "#0B2A4A";
}

type BasicMail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(m: BasicMail) {
  const to = normalizeRecipientEmail(m.to);
  const subject = normalizeSubject(m.subject);
  const text = normalizePlainText(m.text);
  const resend = new Resend(mustEnv("RESEND_API_KEY"));
  const from = mustEnv("EMAIL_FROM");

  // Minimal plain-text email (back-compat for admin actions)
  await resend.emails.send({
    from,
    to,
    subject,
    text,
  });
}

export type ShareEmailParams = {
  to: string;
  subject: string;
  brandName: string;
  brandColor: string;
  brandLogoUrl?: string | null;

  docTitle: string;
  shareUrl: string;

  expiresAtLabel?: string | null;
  maxViewsLabel?: string | null;
  currentViewsLabel?: string | null;
  viewsLeftLabel?: string | null;
};

export async function sendShareEmail(p: ShareEmailParams) {
  const to = normalizeRecipientEmail(p.to);
  const subject = normalizeSubject(p.subject);
  const resend = new Resend(mustEnv("RESEND_API_KEY"));
  const from = mustEnv("EMAIL_FROM");

  const html = renderShareEmailHtml(p);

  await resend.emails.send({
    from,
    to,
    subject,
    html,
  });
}

export async function sendAccountActivationEmail(args: { to: string; activationUrl: string }) {
  const to = normalizeRecipientEmail(args.to);
  const activationUrl = normalizeHttpUrl(args.activationUrl, "activationUrl");
  const resend = new Resend(mustEnv("RESEND_API_KEY"));
  const from = mustEnv("EMAIL_FROM");

  const subject = "Activate your cyang.io account";
  const text =
    `Welcome to cyang.io.\n\n` +
    `Activate your account by clicking this link:\n${activationUrl}\n\n` +
    `This activation link expires in 24 hours.\n`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Welcome to cyang.io.</p>
      <p>Activate your account by clicking the link below:</p>
      <p><a href="${esc(activationUrl)}">${esc(activationUrl)}</a></p>
      <p style="color:#666;font-size:12px">This activation link expires in 24 hours.</p>
    </div>
  `;

  await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
  });
}

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderShareEmailHtml(p: ShareEmailParams) {
  const shareUrl = normalizeHttpUrl(p.shareUrl, "shareUrl");
  const brandLogoUrl = normalizeOptionalHttpUrl(p.brandLogoUrl);
  const brandName = esc(p.brandName || "Document Share");
  const brandColor = normalizeBrandColor(p.brandColor);

  const docTitle = esc(p.docTitle || "Document");
  const shareUrlEsc = esc(shareUrl);

  const metaRows: Array<{ label: string; value: string }> = [];

  if (p.expiresAtLabel) metaRows.push({ label: "Expires", value: esc(p.expiresAtLabel) });
  if (p.maxViewsLabel) metaRows.push({ label: "Max views", value: esc(p.maxViewsLabel) });
  if (p.currentViewsLabel) metaRows.push({ label: "Current views", value: esc(p.currentViewsLabel) });
  if (p.viewsLeftLabel) metaRows.push({ label: "Views left", value: esc(p.viewsLeftLabel) });

  const metaHtml =
    metaRows.length === 0
      ? ""
      : `
        <div style="margin-top:14px;padding:12px 14px;border:1px solid #E6E8EC;border-radius:12px;background:#FAFBFC;">
          ${metaRows
        .map(
          (r, idx) => `
              <div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;line-height:20px;padding:6px 0;${idx === metaRows.length - 1 ? "" : "border-bottom:1px solid #EFF1F4;"}">
                <div style="color:#5B616E;">${r.label}</div>
                <div style="color:#111827;font-weight:600;text-align:right;">${r.value}</div>
              </div>
            `
        )
        .join("")}
        </div>
      `;

  const logo =
    brandLogoUrl
      ? `<img src="${esc(brandLogoUrl)}" alt="${brandName}" style="height:28px;max-width:220px;object-fit:contain;display:block;" />`
      : `<div style="font-weight:800;font-size:18px;letter-spacing:-0.2px;color:#111827;">${brandName}</div>`;

  return `
  <div style="background:#F6F7FB;padding:28px 12px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:640px;margin:0 auto;">
      <div style="padding:14px 18px;margin-bottom:12px;">
        ${logo}
      </div>

      <div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:16px;overflow:hidden;box-shadow:0 6px 22px rgba(17,24,39,0.06);">
        <div style="padding:22px 22px 8px 22px;border-bottom:1px solid #EFF1F4;">
          <div style="font-size:14px;color:#5B616E;margin-bottom:6px;">You’ve been sent a document</div>
          <div style="font-size:22px;line-height:28px;font-weight:800;color:#111827;">${docTitle}</div>
        </div>

        <div style="padding:18px 22px 22px 22px;">
          <div style="font-size:15px;line-height:22px;color:#374151;">
            Use the button below to open it. If the button doesn’t work, copy/paste the link.
          </div>

          <div style="margin-top:16px;">
            <a href="${shareUrlEsc}" style="display:inline-block;background:${brandColor};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:12px 16px;border-radius:12px;">
              Open document
            </a>
          </div>

          ${metaHtml}

          <div style="margin-top:16px;font-size:12px;line-height:18px;color:#6B7280;">
            Link: <a href="${shareUrlEsc}" style="color:${brandColor};text-decoration:underline;word-break:break-all;">${shareUrlEsc}</a>
          </div>
        </div>
      </div>

      <div style="max-width:640px;margin:10px auto 0 auto;color:#9CA3AF;font-size:12px;text-align:center;">
        Sent by ${brandName}
      </div>
    </div>
  </div>
  `;
}
