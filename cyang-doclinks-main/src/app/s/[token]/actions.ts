// src/app/s/[token]/actions.ts
"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { resolveShareMeta } from "@/lib/resolveDoc";
import {
  makeDeviceTrustCookieValue,
  makeEmailProofToken,
  shareUnlockCookieName,
  unlockCookieOptions,
  verifyDeviceTrustCookieValue,
} from "@/lib/shareAuth";

const UNLOCK_HOURS = 8;
const RATE_LIMIT_PER_MIN = 10;

function randomId() {
  return crypto.randomBytes(24).toString("base64url");
}

function isExpired(expires_at: string | null) {
  if (!expires_at) return false;
  const t = new Date(expires_at).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

function isMaxed(view_count: number, max_views: number | null) {
  if (max_views === null) return false;
  if (max_views === 0) return false; // 0 = unlimited
  return view_count >= max_views;
}

async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
  const salt = process.env.VIEW_SALT || process.env.SHARE_SALT || "";
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

async function logAccess(opts: {
  token: string;
  emailUsed: string | null;
  success: boolean;
  failureReason: string | null;
}) {
  try {
    const h = await headers();
    const ua = h.get("user-agent") || null;
    const ip = await getClientIpFromHeaders();

    await sql`
      insert into public.doc_access_logs
        (share_id, ip, user_agent, email_used, success, failure_reason)
      values
        (${opts.token}, ${ip || null}, ${ua}, ${opts.emailUsed}, ${opts.success}, ${opts.failureReason})
    `;
  } catch {
    // best-effort
  }
}

async function upsertTrustedDevice(opts: {
  token: string;
  deviceHash: string;
  expiresAtIso: string;
  emailUsed: string | null;
}) {
  // Best-effort. If table doesn't exist yet, skip.
  try {
    await sql`
      insert into public.trusted_devices (share_id, device_hash, expires_at, email_used)
      values (${opts.token}, ${opts.deviceHash}, ${opts.expiresAtIso}, ${opts.emailUsed})
    `;
  } catch {
    // ignore
  }
}

export async function isShareUnlockedAction(token: string): Promise<boolean> {
  const c = await cookies();
  const raw = c.get(shareUnlockCookieName())?.value || "";
  const v = verifyDeviceTrustCookieValue(raw);
  if (!v.ok) return false;
  if (v.token !== token) return false;

  // DB check (best-effort). If table missing, trust only the signature/exp.
  try {
    const rows = (await sql`
      select 1
      from public.trusted_devices
      where share_id = ${token}
        and device_hash = ${v.deviceHash}
        and expires_at > now()
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return true;
  }
}

async function rateLimitOk(token: string, ipHash: string) {
  const rows = (await sql`
    select count(*)::int as c
    from public.share_pw_attempts
    where token = ${token}
      and ip_hash = ${ipHash}
      and created_at > now() - interval '1 minute'
  `) as unknown as Array<{ c: number }>;

  const c = rows?.[0]?.c ?? 0;
  return c < RATE_LIMIT_PER_MIN;
}

export type VerifySharePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "revoked"
        | "expired"
        | "maxed"
        | "rate_limited"
        | "bad_password"
        | "email_required";
      message: string;
    };

function baseUrlFromEnv(): string {
  const u =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";

  if (u.startsWith("http")) return u;
  return `https://${u}`;
}

async function trySendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const key = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM || process.env.RESEND_FROM || "Cyang Docs <no-reply@cyang.io>";

  if (!key) return { ok: false, message: "RESEND_API_KEY not set" };

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: from,
        headers: { "X-Auto-Response-Suppress": "All" },
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, message: `Resend error: ${r.status} ${txt}` };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Failed to send email" };
  }
}

export type RequestEmailProofResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "mismatch" | "send_failed"; message: string };

/**
 * Email-bound enforcement: request a signed email-proof link.
 * The share must have allowedEmail set; the user must enter the matching email.
 */
export async function requestEmailProofAction(formData: FormData): Promise<RequestEmailProofResult> {
  const token = String(formData.get("token") || "").trim();
  const emailRaw = String(formData.get("email") || "").trim();
  const email = emailRaw.toLowerCase();

  if (!token) return { ok: false, error: "not_found", message: "Missing token." };
  if (!email) return { ok: false, error: "mismatch", message: "Enter your email." };

  const share = await resolveShareMeta(token);
  if (!share.ok) {
    await logAccess({ token, emailUsed: email, success: false, failureReason: "not_found" });
    return { ok: false, error: "not_found", message: "Share not found." };
  }

  if (share.revokedAt)
    return { ok: false, error: "not_found", message: "This share was revoked." };
  if (isExpired(share.expiresAt))
    return { ok: false, error: "not_found", message: "This share link has expired." };
  if (isMaxed(share.viewCount, share.maxViews))
    return { ok: false, error: "not_found", message: "This share link has reached its max views." };

  const allowed = (share.allowedEmail || "").toLowerCase();
  if (!allowed || allowed !== email) {
    await logAccess({ token, emailUsed: email, success: false, failureReason: "email_mismatch" });
    return { ok: false, error: "mismatch", message: "That email is not authorized for this link." };
  }

  const proof = makeEmailProofToken({ token, email });
  const url = new URL(`${baseUrlFromEnv().replace(/\/+$/, "")}/s/${encodeURIComponent(token)}`);
  url.searchParams.set("proof", proof);

  const subject = "Your secure document link";
  const html = `
    <div style="font-family: ui-sans-serif, system-ui; line-height:1.45;">
      <h2 style="margin:0 0 12px 0;">Verify your email to view</h2>
      <p style="margin:0 0 12px 0;">Click the button below to access your document. This link expires in 15 minutes.</p>
      <p style="margin:16px 0;">
        <a href="${url.toString()}" style="display:inline-block;padding:10px 14px;border-radius:10px;text-decoration:none;border:1px solid #ddd;">
          Open document
        </a>
      </p>
      <p style="color:#666;font-size:12px;margin:0;">If you didn’t request this, you can ignore this email.</p>
    </div>
  `;
  const text = `Verify your email to view: ${url.toString()}`;

  const sent = await trySendResendEmail({ to: email, subject, html, text });
  if (!sent.ok) {
    await logAccess({ token, emailUsed: email, success: false, failureReason: "email_send_failed" });
    return { ok: false, error: "send_failed", message: sent.message };
  }

  await logAccess({ token, emailUsed: email, success: true, failureReason: null });
  return { ok: true };
}

/**
 * Core verifier that returns a structured result.
 * Password unlock is only relevant when share has a password.
 */
export async function verifySharePasswordCore(formData: FormData): Promise<VerifySharePasswordResult> {
  const token = String(formData.get("token") || "").trim();
  const password = String(formData.get("password") || "");

  if (!token) return { ok: false, error: "not_found", message: "Missing token." };

  const share = await resolveShareMeta(token);
  if (!share.ok) return { ok: false, error: "not_found", message: "Share not found." };

  if (share.revokedAt) return { ok: false, error: "revoked", message: "This share was revoked." };
  if (isExpired(share.expiresAt))
    return { ok: false, error: "expired", message: "This share link has expired." };
  if (isMaxed(share.viewCount, share.maxViews))
    return { ok: false, error: "maxed", message: "This share link has reached its max views." };

  // If email-bound, you MUST verify email before unlocking.
  if (share.allowedEmail) {
    return { ok: false, error: "email_required", message: "Email verification required." };
  }

  const passwordHash = share.passwordHash;
  const deviceId = randomId();
  const deviceHash = crypto.createHash("sha256").update(deviceId).digest("hex");
  const expiresAt = new Date(Date.now() + UNLOCK_HOURS * 3600 * 1000);

  // No password set → unlock immediately
  if (!passwordHash) {
    await upsertTrustedDevice({
      token,
      deviceHash,
      expiresAtIso: expiresAt.toISOString(),
      emailUsed: null,
    });

    const c = await cookies();
    c.set(
      shareUnlockCookieName(),
      makeDeviceTrustCookieValue({ token, deviceId }),
      unlockCookieOptions()
    );

    await logAccess({ token, emailUsed: null, success: true, failureReason: null });
    return { ok: true };
  }

  // Rate limit (best-effort)
  try {
    const ip = await getClientIpFromHeaders();
    const ipHash = hashIp(ip) || "unknown";

    const ok = await rateLimitOk(token, ipHash);
    if (!ok) {
      await logAccess({ token, emailUsed: null, success: false, failureReason: "rate_limited" });
      return { ok: false, error: "rate_limited", message: "Too many attempts. Try again soon." };
    }

    await sql`
      insert into public.share_pw_attempts (token, ip_hash)
      values (${token}, ${ipHash})
    `;
  } catch {
    // If attempts table missing, don’t block unlock.
  }

  const match = await bcrypt.compare(password, passwordHash);
  if (!match) {
    await logAccess({ token, emailUsed: null, success: false, failureReason: "bad_password" });
    return { ok: false, error: "bad_password", message: "Incorrect password." };
  }

  await upsertTrustedDevice({
    token,
    deviceHash,
    expiresAtIso: expiresAt.toISOString(),
    emailUsed: null,
  });

  const c = await cookies();
  c.set(
    shareUnlockCookieName(),
    makeDeviceTrustCookieValue({ token, deviceId }),
    unlockCookieOptions()
  );

  await logAccess({ token, emailUsed: null, success: true, failureReason: null });
  return { ok: true };
}

/**
 * Use THIS for <form action={...}>.
 * Must return void/Promise<void>. Redirects instead of returning data.
 */
export async function verifySharePasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") || "").trim();
  const res = await verifySharePasswordCore(formData);

  if (res.ok) {
    redirect(`/s/${encodeURIComponent(token)}/raw`);
  }

  if (res.error === "email_required") {
    redirect(`/s/${encodeURIComponent(token)}?error=${encodeURIComponent("Email verification required.")}`);
  }

  redirect(`/s/${encodeURIComponent(token)}?error=${encodeURIComponent(res.message)}`);
}

/**
 * Use THIS from client components.
 */
export async function verifySharePasswordResultAction(
  formData: FormData
): Promise<VerifySharePasswordResult> {
  return verifySharePasswordCore(formData);
}
