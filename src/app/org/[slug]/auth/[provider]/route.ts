// src/app/org/[slug]/auth/[provider]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ORG_COOKIE_NAME, ORG_INVITE_COOKIE_NAME } from "@/lib/tenant";
import { getOrgBySlug } from "@/lib/orgs";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["google", "enterprise-oidc"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const INVITE_TOKEN_MAX = 512;
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type RouteCtx = {
  // Next.js typings changed in recent versions: `params` may be a Promise.
  params: { slug: string; provider: string } | Promise<{ slug: string; provider: string }>;
};

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:org_auth_start",
    limit: Number(process.env.RATE_LIMIT_ORG_AUTH_START_IP_PER_MIN || 30),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT", message: "Too many requests. Try again shortly." },
      {
        status: rl.status,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const params = await Promise.resolve(ctx.params);
  const slug = String(params?.slug || "").trim().toLowerCase();
  const provider = String(params?.provider || "").trim().toLowerCase();

  let appBaseUrl: string;
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json(
      { ok: false, error: "ENV_MISCONFIGURED" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!slug || !SLUG_RE.test(slug)) {
    const res = NextResponse.redirect(new URL("/login", appBaseUrl));
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const org = await getOrgBySlug(slug);
  if (!org) {
    const res = NextResponse.redirect(new URL("/login", appBaseUrl));
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  if (!ALLOWED.has(provider)) {
    const res = NextResponse.redirect(new URL(`/org/${encodeURIComponent(slug)}/login`, appBaseUrl));
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const inviteTokenRaw = String(new URL(req.url).searchParams.get("invite") || "").trim().slice(0, INVITE_TOKEN_MAX);
  const inviteToken = INVITE_TOKEN_RE.test(inviteTokenRaw) ? inviteTokenRaw : "";

  // Bind org to this browser (httpOnly so JS can't tamper with it).
  const res = NextResponse.redirect(
    new URL(
      `/api/auth/signin/${encodeURIComponent(provider)}?callbackUrl=${encodeURIComponent("/auth/continue-admin")}`,
      appBaseUrl
    )
  );
  res.headers.set("Cache-Control", "no-store");

  res.cookies.set(ORG_COOKIE_NAME, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });

  if (inviteToken) {
    res.cookies.set(ORG_INVITE_COOKIE_NAME, inviteToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 30, // 30 minutes
    });
  }

  return res;
}
