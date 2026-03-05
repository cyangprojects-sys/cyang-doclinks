import { NextRequest, NextResponse } from "next/server";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { isTermsAccepted, setSignupConsentCookie } from "@/lib/signup";

export const runtime = "nodejs";
const MAX_CONSENT_BODY_BYTES = 8 * 1024;

function parseJsonBodyLength(req: NextRequest): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

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

  if (parseJsonBodyLength(req) > MAX_CONSENT_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const body = (await req.json().catch(() => ({}))) as { acceptTerms?: boolean };
  if (!isTermsAccepted(body.acceptTerms)) {
    return NextResponse.json({ ok: false, error: "TERMS_REQUIRED" }, { status: 400 });
  }

  await setSignupConsentCookie();
  return NextResponse.json({ ok: true });
}
