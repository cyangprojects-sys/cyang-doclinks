import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { ensureUserByEmail } from "@/lib/authz";

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],

    session: { strategy: "jwt" },

    secret: process.env.NEXTAUTH_SECRET,

    callbacks: {
        async session({ session, token }) {
            if (session?.user) {
                session.user.email = token.email as string;

                // Convenience fields (server-side auth should still read from DB)
                (session.user as any).id = (token as any).uid ?? null;
                (session.user as any).role = (token as any).role ?? null;
            }
            return session;
        },

        async jwt({ token, account, profile }) {
            // On sign-in: upsert user and store id/role in JWT.
            if (account && profile) {
                const email = (profile as any).email as string | undefined;
                if (email) {
                    token.email = email;
                    const u = await ensureUserByEmail(email);
                    (token as any).uid = u.id;
                    (token as any).role = u.role;
                }
            }

            // Older tokens may not have uid/role.
            if (token?.email && (!(token as any).uid || !(token as any).role)) {
                const u = await ensureUserByEmail(String(token.email));
                (token as any).uid = u.id;
                (token as any).role = u.role;
            }

            return token;
        },
    },
};
