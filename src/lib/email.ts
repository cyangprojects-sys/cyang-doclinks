// src/lib/email.ts
import { Resend } from "resend";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type BasicMail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(m: BasicMail) {
  const resend = new Resend(mustEnv("RESEND_API_KEY"));
  const from = mustEnv("EMAIL_FROM");

  // Minimal plain-text email (back-compat for admin actions)
  await resend.emails.send({
    from,
    to: m.to,
    subject: m.subject,
    text: m.text,
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
  const resend = new Resend(mustEnv("RESEND_API_KEY"));
  const from = mustEnv("EMAIL_FROM");

  const html = renderShareEmailHtml(p);

  await resend.emails.send({
    from,
    to: p.to,
    subject: p.subject,
    html,
  });
}

export async function sendAccountActivationEmail(args: { to: string; activationUrl: string }) {
  const resend = new Resend(mustEnv("RESEND_API_KEY"));
  const from = mustEnv("EMAIL_FROM");

  const subject = "Activate your cyang.io account";
  const text =
    `Welcome to cyang.io.\n\n` +
    `Activate your account by clicking this link:\n${args.activationUrl}\n\n` +
    `This activation link expires in 24 hours.\n`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Welcome to cyang.io.</p>
      <p>Activate your account by clicking the link below:</p>
      <p><a href="${args.activationUrl}">${args.activationUrl}</a></p>
      <p style="color:#666;font-size:12px">This activation link expires in 24 hours.</p>
    </div>
  `;

  await resend.emails.send({
    from,
    to: args.to,
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
  const brandName = esc(p.brandName || "Document Share");
  const brandColor = p.brandColor || "#0B2A4A";

  const docTitle = esc(p.docTitle || "Document");
  const shareUrl = p.shareUrl;

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
    p.brandLogoUrl
      ? `<img src="${esc(p.brandLogoUrl)}" alt="${brandName}" style="height:28px;max-width:220px;object-fit:contain;display:block;" />`
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
            <a href="${shareUrl}" style="display:inline-block;background:${brandColor};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:12px 16px;border-radius:12px;">
              Open document
            </a>
          </div>

          ${metaHtml}

          <div style="margin-top:16px;font-size:12px;line-height:18px;color:#6B7280;">
            Link: <a href="${shareUrl}" style="color:${brandColor};text-decoration:underline;word-break:break-all;">${shareUrl}</a>
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
