import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { buildAuthOptions } from "@/auth";

async function handle(req: NextRequest) {
  // org slug is set by /org/[slug]/auth/[provider] before redirecting into NextAuth
  const orgSlug = req.cookies.get("cyang_org")?.value ?? "default";
  const opts = await buildAuthOptions(orgSlug);

  // NextAuth v4 App Router handler expects a Request-like object; NextRequest works at runtime.
  const handler = NextAuth(opts);
  return handler(req as any);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
