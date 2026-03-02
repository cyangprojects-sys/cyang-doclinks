import { NextResponse } from "next/server";
import { setSignupConsentCookie } from "@/lib/signup";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { acceptTerms?: boolean };
  if (!body.acceptTerms) {
    return NextResponse.json({ ok: false, error: "TERMS_REQUIRED" }, { status: 400 });
  }

  await setSignupConsentCookie();
  return NextResponse.json({ ok: true });
}

