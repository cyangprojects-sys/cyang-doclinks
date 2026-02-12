// src/proxy.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

/**
 * proxy(): used by your Next.js 15/16 setup instead of middleware.
 * Returns the session (or null) for the current request context.
 */
export async function proxy() {
    return getServerSession(authOptions);
}

export const config = {
    matcher: ["/admin/:path*"],
};
