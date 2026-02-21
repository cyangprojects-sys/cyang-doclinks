import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { buildAuthOptions } from "@/auth";
import { ORG_COOKIE_NAME } from "@/lib/tenant";

/**
 * Multi-tenant Auth.js/NextAuth App Router handler.
 *
 * We bind auth to an org via the httpOnly `cyang_org` cookie set by:
 *   /org/[slug]/auth/[provider]
 *
 * If someone hits /api/auth/signin directly (no org cookie), we redirect to:
 *   /org/default/login
 */
async function handler(req: NextRequest) {
  // Next.js 16.1.x types `cookies()` inconsistently; normalize via Promise.resolve.
  const cookieJar: any = await Promise.resolve(cookies() as any);
  const cookieSlug = cookieJar?.get?.(ORG_COOKIE_NAME)?.value ?? null;
  const orgSlug = String(cookieSlug || "").trim().toLowerCase() || "default";

  // Protect the common entrypoint.
  if (req.nextUrl.pathname.endsWith("/signin")) {
    const hasOrg = Boolean(String(cookieSlug || "").trim());
    if (!hasOrg) {
      const url = new URL(`/org/default/login`, req.nextUrl.origin);
      return NextResponse.redirect(url);
    }
  }

  const opts = await buildAuthOptions(orgSlug);
  const nextAuthHandler = NextAuth(opts) as any;
  return nextAuthHandler(req);
}

export { handler as GET, handler as POST };
