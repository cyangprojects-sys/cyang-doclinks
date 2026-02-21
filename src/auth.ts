import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Enterprise SSO (BYO OIDC) — NextAuth v4-compatible
 *
 * Your repo is importing `authOptions` from "@/auth" (and uses getServerSession),
 * so we export a stable `authOptions` object.
 *
 * Also: your installed next-auth does NOT include `next-auth/providers/oidc`,
 * so we implement a generic OIDC provider using the built-in OAuth provider shape.
 *
 * This setup is SAFE when Enterprise SSO is not configured yet:
 * - The Enterprise OIDC provider is only registered if all required env vars exist.
 * - A no-op Credentials provider is always present so providers[] is never empty
 *   (prevents /api/auth/signin 500s in some configurations).
 *
 * Required env vars to ENABLE enterprise SSO:
 * - OIDC_ISSUER
 * - OIDC_CLIENT_ID
 * - OIDC_CLIENT_SECRET
 *
 * Recommended env vars (Vercel):
 * - NEXTAUTH_URL = https://www.cyang.io
 * - NEXTAUTH_SECRET = long random
 */

function hasEnv(...keys: string[]) {
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export const isEnterpriseSsoConfigured = hasEnv(
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET"
);

function enterpriseOidcProvider() {
  const issuer = process.env.OIDC_ISSUER!;
  // Most OIDC providers expose the standard well-known discovery endpoint:
  // `${issuer}/.well-known/openid-configuration`
  const wellKnown = issuer.replace(/\/+$/, "") + "/.well-known/openid-configuration";

  return {
    id: "enterprise-sso",
    name: "Enterprise SSO",
    type: "oauth",
    wellKnown,
    clientId: process.env.OIDC_CLIENT_ID!,
    clientSecret: process.env.OIDC_CLIENT_SECRET!,
    authorization: { params: { scope: "openid email profile" } },
    idToken: true,
    checks: ["pkce", "state"],
    profile(profile: any) {
      // Keep it minimal and resilient across providers
      return {
        id: profile.sub ?? profile.id ?? profile.user_id ?? profile.oid ?? profile.uid,
        name:
          profile.name ??
          [profile.given_name, profile.family_name].filter(Boolean).join(" ") ??
          profile.preferred_username ??
          profile.email ??
          null,
        email: profile.email ?? profile.upn ?? profile.preferred_username ?? null,
        image: profile.picture ?? null,
      };
    },
  } as const;
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Always include a no-op provider so NextAuth doesn't choke on empty providers[].
    // We do NOT expose this provider via UI (we use a custom /signin page).
    Credentials({
      id: "disabled",
      name: "Disabled",
      credentials: {},
      async authorize() {
        return null;
      },
    }),

    ...(isEnterpriseSsoConfigured ? [enterpriseOidcProvider() as any] : []),
  ],

  pages: {
    signIn: "/signin",
  },

  session: { strategy: "jwt" },

  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // ignore
      }
      return `${baseUrl}/dashboard`;
    },
  },
};
