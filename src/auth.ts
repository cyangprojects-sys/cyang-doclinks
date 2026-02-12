// src/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function parseOwnerEmails() {
    // Support either OWNER_EMAIL (single) or OWNER_EMAILS (comma/space separated)
    const raw =
        process.env.OWNER_EMAILS ??
        process.env.OWNER_EMAIL ??
        "";

    return raw
        .split(/[, \n\r\t]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

const OWNER_EMAILS = parseOwnerEmails();

export const { handlers, auth, signIn, signOut } = NextAuth({
    // If you're on Vercel this is generally fine; helps avoid host/trust issues
    trustHost: true,

    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],

    callbacks: {
        async signIn({ user }) {
            const email = (user.email || "").toLowerCase();
            if (!email) return false;

            // OWNER allowlist
            if (OWNER_EMAILS.length === 0) return false;
            return OWNER_EMAILS.includes(email);
        },

        async session({ session, token }) {
            // Keep email stable
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
});
