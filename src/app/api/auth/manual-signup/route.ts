import { NextResponse } from "next/server";
import { sendAccountActivationEmail } from "@/lib/email";
import {
  createOrRefreshManualSignup,
  recordTermsAcceptance,
  SIGNUP_TERMS_VERSION,
  validatePasswordComplexity,
} from "@/lib/signup";

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

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function appUrl(req: Request): string {
  const configured = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const company = String(body.company || "").trim();
  const jobTitle = String(body.jobTitle || "").trim();
  const country = String(body.country || "").trim();

  if (!firstName || !lastName || !email || !password || !confirmPassword || !company || !country) {
    return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ ok: false, error: "PASSWORD_MISMATCH" }, { status: 400 });
  }
  if (!body.acceptTerms) {
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

    const activationUrl = `${appUrl(req)}/signup/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    await sendAccountActivationEmail({ to: email, activationUrl });
    await recordTermsAcceptance(email, `manual_signup:${SIGNUP_TERMS_VERSION}`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "SIGNUP_FAILED";
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

