import { NextRequest, NextResponse } from "next/server";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { setSignupConsentCookie } from "@/lib/signup";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:signup_consent",
    limit: Number(process.env.RATE_LIMIT_SIGNUP_CONSENT_IP_PER_MIN || 30),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT", message: "Too many requests. Try again shortly." },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { acceptTerms?: boolean };
  if (!body.acceptTerms) {
    return NextResponse.json({ ok: false, error: "TERMS_REQUIRED" }, { status: 400 });
  }

  await setSignupConsentCookie();
  return NextResponse.json({ ok: true });
}
