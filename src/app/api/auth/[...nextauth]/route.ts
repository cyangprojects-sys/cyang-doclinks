// src/app/api/auth/[...nextauth]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import NextAuth from "next-auth";
import { authOptions } from "@/auth";
import { handlers } from "@/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
export const { GET, POST } = handlers;
