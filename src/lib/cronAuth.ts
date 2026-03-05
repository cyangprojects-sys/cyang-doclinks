// src/lib/cronAuth.ts
import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";

const MAX_CRON_SECRET_LEN = 256;
const MAX_AUTH_HEADER_LEN = 512;

function timingSafeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

/**
 * Vercel Cron invokes routes with an Authorization header.
 * We compare it against CRON_SECRET (required).
 *
 * Accepts either:
 * - "<secret>"
 * - "Bearer <secret>"
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || "").trim().slice(0, MAX_CRON_SECRET_LEN);
  if (!secret) return false;

  const auth = String(req.headers.get("authorization") || "").trim().slice(0, MAX_AUTH_HEADER_LEN);
  if (!auth) return false;

  if (timingSafeEqual(auth, secret)) return true;
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim().slice(0, MAX_CRON_SECRET_LEN);
    if (timingSafeEqual(token, secret)) return true;
  }
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
