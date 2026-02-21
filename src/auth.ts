import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { ensureUserByEmail } from "@/lib/authz";

function isNonEmpty(v: string | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeIssuer(raw: string): string {
  // Accept values like:
  // - https://login.microsoftonline.com/<tenant>/v2.0
  // - https://dev-123456.okta.com/oauth2/default
  // - https://auth.example.com/realms/acme
  return raw.replace(/\/+$/, "");
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // Optional Enterprise SSO (OIDC)
    // next-auth v4 does not ship a generic `next-auth/providers/oidc` in this repo,
    // and `providers/oauth` typing can vary depending on module settings.
    // So we provide a standard OIDC-compatible provider object.
    ...(isNonEmpty(process.env.ENTERPRISE_OIDC_ISSUER) &&
    isNonEmpty(process.env.ENTERPRISE_OIDC_CLIENT_ID) &&
    isNonEmpty(process.env.ENTERPRISE_OIDC_CLIENT_SECRET)
      ? [
          {
            id: "enterprise-oidc",
            name: "Enterprise SSO",
            type: "oauth",
            // OIDC discovery endpoint
            wellKnown: `${normalizeIssuer(
              process.env.ENTERPRISE_OIDC_ISSUER
            )}/.well-known/openid-configuration`,
            authorization: {
              params: {
                scope: "openid email profile",
              },
            },
            idToken: true,
            checks: ["pkce", "state"],
            clientId: process.env.ENTERPRISE_OIDC_CLIENT_ID,
            clientSecret: process.env.ENTERPRISE_OIDC_CLIENT_SECRET,
            profile(profile: any) {
              // Normalize to what next-auth expects.
              // Many IdPs provide email in `email`; some use `preferred_username`.
              const email =
                profile?.email ??
                profile?.preferred_username ??
                profile?.upn ??
                undefined;
              return {
                id: profile?.sub ?? email ?? "enterprise-user",
                name: profile?.name ?? profile?.displayName ?? null,
                email,
                image: null,
              };
            },
          } as any,
        ]
      : []),
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
