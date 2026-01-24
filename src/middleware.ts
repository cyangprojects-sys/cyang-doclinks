import { NextResponse, type NextRequest } from "next/server";

// Protect these paths:
const PROTECTED_PREFIXES = ["/admin", "/api/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Basic “must be signed in” check at the edge:
  // If your session cookie is named cy_doc_session, require it to exist.
  const hasSession = Boolean(req.cookies.get("cy_doc_session")?.value);

  if (!hasSession) {
    // 404 (stealth) or redirect to login—your call.
    return new NextResponse("Not found", { status: 404 });
  }

  // Owner enforcement is still done in requireOwner() on the server routes.
  // Middleware keeps out anonymous traffic early.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
