// src/lib/cronAuth.ts
import type { NextRequest } from "next/server";

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
