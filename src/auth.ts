// src/auth.ts
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import Google from "next-auth/providers/google";

function parseOwnerEmails() {
    const raw = process.env.OWNER_EMAILS ?? process.env.OWNER_EMAIL ?? "";
    return raw
        .split(/[, \n\r\t]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

const OWNER_EMAILS = parseOwnerEmails();

export const authOptions: NextAuthOptions = {
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
    ],

    callbacks: {
        async signIn({ user }) {
            const email = (user.email || "").toLowerCase();
            if (!email) return false;
            if (OWNER_EMAILS.length === 0) return false;
            return OWNER_EMAILS.includes(email);
        },

        async session({ session, token }) {
            // Keep email stable for server usage
            if (session.user && token.email) {
                session.user.email = String(token.email);
            }
            return session;
        },

        async jwt({ token, user }) {
            if (user?.email) token.email = user.email;
            return token;
        },
    },
};

/**
 * Keep the same API your app is using (`auth()`),
 * but implement it via getServerSession for this installed next-auth version.
 */
export function auth() {
    return getServerSession(authOptions);
}
