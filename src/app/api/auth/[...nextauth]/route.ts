import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { buildAuthOptions } from "@/auth";
import { ORG_COOKIE_NAME } from "@/lib/tenant";

async function handler(req: NextRequest) {
  const orgSlug = req.cookies.get(ORG_COOKIE_NAME)?.value?.trim()?.toLowerCase() ?? null;
  const opts = await buildAuthOptions(orgSlug);
  // NextAuth v4 App Router handler
  // @ts-expect-error next-auth types don't model NextRequest perfectly here
  return NextAuth(opts)(req);
}

export { handler as GET, handler as POST };
