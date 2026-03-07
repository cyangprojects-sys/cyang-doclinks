import { NextRequest, NextResponse } from "next/server";
import { sendAccountActivationEmail } from "@/lib/email";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import {
  createOrRefreshManualSignup,
  isSignupEnabled,
  isTermsAccepted,
  recordTermsAcceptance,
  SIGNUP_TERMS_VERSION,
  validatePasswordComplexity,
} from "@/lib/signup";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";

type Payload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  company?: string;
  jobTitle?: string;
  country?: string;
  acceptTerms?: boolean;
};

const MAX_SIGNUP_BODY_BYTES = 32 * 1024;
const MAX_FIRST_LAST_LEN = 120;
const MAX_COMPANY_LEN = 200;
const MAX_JOB_TITLE_LEN = 160;
const MAX_COUNTRY_LEN = 120;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function cleanRequiredText(valueRaw: unknown, maxLen: number): string {
  const value = String(valueRaw || "").trim();
  if (!value || value.length > maxLen || /[\r\n\0]/.test(value)) return "";
  return value;
}

function cleanOptionalText(valueRaw: unknown, maxLen: number): string {
  const value = String(valueRaw || "").trim();
  if (!value) return "";
  if (value.length > maxLen || /[\r\n\0]/.test(value)) return "";
  return value;
}

export async function POST(req: NextRequest) {
  if (!isSignupEnabled()) {
    return NextResponse.json(
      { ok: false, error: "SIGNUP_DISABLED", message: "Sign up is temporarily disabled." },
      { status: 403 }
    );
  }

  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:manual_signup",
    limit: Number(process.env.RATE_LIMIT_MANUAL_SIGNUP_IP_PER_MIN || 8),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT", message: "Too many signup attempts. Try again shortly." },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  if (parseJsonBodyLength(req) > MAX_SIGNUP_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const body = (await req.json().catch(() => ({}))) as Payload;

  const firstName = cleanRequiredText(body.firstName, MAX_FIRST_LAST_LEN);
  const lastName = cleanRequiredText(body.lastName, MAX_FIRST_LAST_LEN);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const company = cleanRequiredText(body.company, MAX_COMPANY_LEN);
  const jobTitle = cleanOptionalText(body.jobTitle, MAX_JOB_TITLE_LEN);
  const country = cleanRequiredText(body.country, MAX_COUNTRY_LEN);

  if (!firstName || !lastName || !email || !password || !confirmPassword || !company || !country) {
    return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ ok: false, error: "PASSWORD_MISMATCH" }, { status: 400 });
  }
  if (!isTermsAccepted(body.acceptTerms)) {
    return NextResponse.json({ ok: false, error: "TERMS_REQUIRED" }, { status: 400 });
  }

  const pwError = validatePasswordComplexity(password);
  if (pwError) {
    return NextResponse.json({ ok: false, error: "WEAK_PASSWORD", message: pwError }, { status: 400 });
  }

  try {
    const { token } = await createOrRefreshManualSignup({
      firstName,
      lastName,
      email,
      password,
      company,
      jobTitle,
      country,
    });

    const activationUrl = `${resolvePublicAppBaseUrl(req.url)}/signup/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    await sendAccountActivationEmail({ to: email, activationUrl });
    await recordTermsAcceptance(email, `manual_signup:${SIGNUP_TERMS_VERSION}`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "SIGNUP_FAILED";
    if (message.includes("INVALID_SIGNUP_INPUT")) {
      return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
    }
    if (message.includes("SIGNUP_TABLES_MISSING")) {
      return NextResponse.json(
        { ok: false, error: "SIGNUP_NOT_CONFIGURED", message: "Run scripts/sql/signup_activation.sql first." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: "SIGNUP_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Check your email for an activation link before signing in.",
  });
}
