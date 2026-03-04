// src/lib/cronAuth.ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * Vercel Cron invokes routes with an Authorization header.
 * We compare it against CRON_SECRET (required).
 *
 * Accepts either:
 * - "<secret>"
 * - "Bearer <secret>"
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;

  const auth = (req.headers.get("authorization") || "").trim();
  if (!auth) return false;

  if (auth === secret) return true;
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === secret) return true;
  return false;
}

function shouldHideCronUnauthorized(): boolean {
  const v = String(process.env.CRON_HIDE_UNAUTHORIZED || "true")
    .trim()
    .toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

export function cronUnauthorizedResponse() {
  if (shouldHideCronUnauthorized()) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
}
