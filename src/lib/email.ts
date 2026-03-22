// src/lib/email.ts
import { Resend } from "resend";

const MAX_ENV_VALUE_LEN = 512;
const MAX_EMAIL_LEN = 320;
const MAX_SUBJECT_LEN = 200;
const MAX_TEXT_LEN = 12000;
const MAX_HEADER_VALUE_LEN = 512;
const MAX_TAG_NAME_LEN = 64;
const MAX_TAG_VALUE_LEN = 128;
const MAX_URL_LEN = 2048;
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let resendClient: Resend | null = null;
let resendApiKey: string | null = null;

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

function normalizeOptionalPlainText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return normalizePlainText(value);
}

function normalizeHeaderValue(value: string | null | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_HEADER_VALUE_LEN || /[\r\n\0]/.test(raw)) return undefined;
  return raw;
}

function normalizeTag(tag: { name: string; value: string }): { name: string; value: string } | null {
  const name = String(tag?.name || "").trim().toLowerCase();
  const value = String(tag?.value || "").trim();
  if (!name || !value) return null;
  if (name.length > MAX_TAG_NAME_LEN || value.length > MAX_TAG_VALUE_LEN) return null;
  if (/[^a-z0-9_.:-]/.test(name) || /[\r\n\0]/.test(value)) return null;
  return { name, value };
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

function getResendClient(): Resend {
  const apiKey = mustEnv("RESEND_API_KEY");
  if (resendClient && resendApiKey === apiKey) return resendClient;
  resendClient = new Resend(apiKey);
  resendApiKey = apiKey;
  return resendClient;
}

type BasicMail = {
  to: string;
  subject: string;
  text: string;
};

type MailSendOptions = {
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  replyTo?: string | null;
  entityRefId?: string | null;
  suppressAutoResponse?: boolean;
  tags?: Array<{ name: string; value: string }>;
};

async function sendEmailMessage(message: MailSendOptions) {
  const resend = getResendClient();
  const from = mustEnv("EMAIL_FROM");
  const to = normalizeRecipientEmail(message.to);
  const subject = normalizeSubject(message.subject);
  const text = normalizeOptionalPlainText(message.text);
  const html = message.html ? String(message.html).trim() : undefined;
  const replyTo = message.replyTo ? normalizeRecipientEmail(message.replyTo) : undefined;
  const entityRefId = normalizeHeaderValue(message.entityRefId);
  const tags = (message.tags || [])
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is { name: string; value: string } => Boolean(tag));
  const headers: Record<string, string> = {};

  if (entityRefId) {
    headers["X-Entity-Ref-ID"] = entityRefId;
  }
  if (message.suppressAutoResponse) {
    headers["X-Auto-Response-Suppress"] = "All";
  }

  const payload = {
    from,
    to,
    subject,
    text,
    html,
    replyTo,
    headers: Object.keys(headers).length ? headers : undefined,
    tags: tags.length ? tags : undefined,
  } as Parameters<typeof resend.emails.send>[0];

  await resend.emails.send(payload);
}

export async function sendMail(m: BasicMail) {
  await sendEmailMessage({
    to: m.to,
    subject: m.subject,
    text: m.text,
  });
}

export async function sendHtmlEmail(message: {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
  entityRefId?: string | null;
  tags?: Array<{ name: string; value: string }>;
}) {
  await sendEmailMessage({
    ...message,
    suppressAutoResponse: true,
  });
}

export async function sendAccountActivationEmail(args: { to: string; activationUrl: string }) {
  const activationUrl = normalizeHttpUrl(args.activationUrl, "activationUrl");

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

  await sendEmailMessage({
    to: args.to,
    subject,
    text,
    html,
    tags: [
      { name: "template", value: "account_activation" },
      { name: "channel", value: "account" },
    ],
  });
}

export async function sendManualPasswordResetEmail(args: { to: string; resetUrl: string }) {
  const resetUrl = normalizeHttpUrl(args.resetUrl, "shareUrl");

  const subject = "Reset your cyang.io password";
  const text =
    `A password reset was requested for your cyang.io account.\n\n` +
    `Set a new password by using this link:\n${resetUrl}\n\n` +
    `This reset link expires in 2 hours. If you did not request it, you can ignore this email.\n`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>A password reset was requested for your cyang.io account.</p>
      <p>Set a new password by using the link below:</p>
      <p><a href="${esc(resetUrl)}">${esc(resetUrl)}</a></p>
      <p style="color:#666;font-size:12px">This reset link expires in 2 hours. If you did not request it, you can ignore this email.</p>
    </div>
  `;

  await sendEmailMessage({
    to: args.to,
    subject,
    text,
    html,
    tags: [
      { name: "template", value: "password_reset" },
      { name: "channel", value: "account" },
    ],
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
