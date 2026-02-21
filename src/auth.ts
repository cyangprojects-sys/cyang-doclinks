import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import OIDCProvider from "next-auth/providers/oidc";

import { ensureUserByEmail } from "@/lib/authz";

export const authOptions: NextAuthOptions = {
    providers: (() => {
    const providers = [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ];

    // Optional enterprise SSO via OIDC (Okta / Azure AD / Auth0 / etc.)
    // Set ENTERPRISE_OIDC_ISSUER + ENTERPRISE_OIDC_CLIENT_ID + ENTERPRISE_OIDC_CLIENT_SECRET.
    const issuer = (process.env.ENTERPRISE_OIDC_ISSUER || "").trim();
    const clientId = (process.env.ENTERPRISE_OIDC_CLIENT_ID || "").trim();
    const clientSecret = (process.env.ENTERPRISE_OIDC_CLIENT_SECRET || "").trim();
    if (issuer && clientId && clientSecret) {
        providers.push(
            OIDCProvider({
                id: "enterprise-oidc",
                name: "Enterprise SSO",
                issuer,
                clientId,
                clientSecret,
            })
        );
    }

    return providers;
})(),


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
