import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import OAuthProvider from "next-auth/providers/oauth";

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
            // next-auth v4 does not ship a generic "oidc" provider.
            // This OAuth config works with OIDC-compliant IdPs (Okta / Azure AD / Auth0 / Keycloak / etc.).
            OAuthProvider({
                id: "enterprise-oidc",
                name: "Enterprise SSO",

                type: "oidc",
                issuer,
                clientId,
                clientSecret,

                // Most IdPs expose discovery at {issuer}/.well-known/openid-configuration
                wellKnown: `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,

                // Ensure we receive an ID token + standard claims
                authorization: { params: { scope: "openid email profile" } },
                idToken: true,
                checks: ["pkce", "state"],

                // Normalize profile shape for next-auth
                profile(profile) {
                    const p: any = profile;
                    return {
                        id: p.sub ?? p.id ?? "",
                        name: p.name ?? p.preferred_username ?? p.email ?? "",
                        email: p.email ?? "",
                        image: p.picture ?? null,
                    };
                },
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
