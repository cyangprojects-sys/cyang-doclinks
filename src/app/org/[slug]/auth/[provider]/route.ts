// src/app/org/[slug]/auth/[provider]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ORG_COOKIE_NAME } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["google", "enterprise-oidc"]);

export async function GET(req: NextRequest, ctx: { params: { slug: string; provider: string } }) {
  const slug = String(ctx?.params?.slug || "").trim().toLowerCase();
  const provider = String(ctx?.params?.provider || "").trim();

  if (!slug) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (!ALLOWED.has(provider)) {
    return NextResponse.redirect(new URL(`/org/${encodeURIComponent(slug)}/login`, req.url));
  }

  // Bind org to this browser (httpOnly so JS can't tamper with it).
  const res = NextResponse.redirect(
    new URL(`/api/auth/signin/${encodeURIComponent(provider)}?callbackUrl=${encodeURIComponent("/admin/dashboard")}`, req.url)
  );

  res.cookies.set(ORG_COOKIE_NAME, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });

  return res;
}
