import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cy_doc_session";
const PROTECTED_PREFIXES = ["/admin", "/api/admin"];

export function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname } = url;

  // --- Dev canonical host: force localhost ---
  // Prevent cookie jar splitting between localhost / 127.0.0.1 / 192.168.x.x
  if (process.env.NODE_ENV !== "production") {
    if (url.hostname !== "localhost") {
      const redirectUrl = new URL(req.url);
      redirectUrl.hostname = "localhost";
      return NextResponse.redirect(redirectUrl);
    }
  }

  // --- Protect admin paths: require session cookie exists ---
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
    if (!hasSession) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Apply host-canonicalization + admin protection.
  // We need to run for /admin and /api/admin (same as before),
  // AND ALSO for the root path so host redirect applies when you first land.
  matcher: ["/", "/admin/:path*", "/api/admin/:path*"],
};
