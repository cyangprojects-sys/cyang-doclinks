import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthOptions, ORG_COOKIE_NAME } from "@/src/auth";

/**
 * Next.js 16.1.x types `cookies()` as Promise<ReadonlyRequestCookies> in some contexts.
 * In route handlers we can safely `await cookies()` and read the org hint cookie.
 *
 * If a user hits /api/auth/signin directly (no org context), we redirect them to the
 * org-scoped sign-in route (Option 2): /org/default/login
 */
async function getOrgSlugCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const v = jar.get(ORG_COOKIE_NAME)?.value ?? "";
    const slug = String(v || "").trim().toLowerCase();
    return slug ? slug : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const cookieSlug = await getOrgSlugCookie();

  // If user hits NextAuth's built-in sign-in endpoint without org context, bounce to default org.
  if (req.nextUrl.pathname.endsWith("/api/auth/signin") && !cookieSlug) {
    const url = new URL("/org/default/login", req.url);
    // Preserve callbackUrl if present
    const callbackUrl = req.nextUrl.searchParams.get("callbackUrl");
    if (callbackUrl) url.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(url);
  }

  const orgSlug = cookieSlug ?? "default";
  const opts = await buildAuthOptions(orgSlug);
  return (NextAuth(opts) as any)(req);
}

export async function POST(req: NextRequest) {
  const cookieSlug = await getOrgSlugCookie();
  const orgSlug = cookieSlug ?? "default";
  const opts = await buildAuthOptions(orgSlug);
  return (NextAuth(opts) as any)(req);
}
