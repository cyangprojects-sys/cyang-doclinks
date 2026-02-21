import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth (NextAuth v4)
 *
 * Sign-in methods:
 * - Google OAuth (regular email accounts)
 * - Enterprise SSO (BYO OIDC) (organizational logins)
 *
 * Landing behavior:
 * - ALWAYS land on /admin/dashboard after a successful sign-in, regardless of callbackUrl.
 *
 * Safety:
 * - Providers are only enabled when their env vars exist (prevents /api/auth/signin 500s).
 * - A no-op Credentials provider is always present so providers[] is never empty.
 *
 * Env vars (core):
 * - NEXTAUTH_URL=https://www.cyang.io
 * - NEXTAUTH_SECRET=<long random>
 *
 * Google OAuth:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 *
 * Enterprise OIDC (BYO):
 * - OIDC_ISSUER
 * - OIDC_CLIENT_ID
 * - OIDC_CLIENT_SECRET
 */

const POST_SIGN_IN_PATH = "/admin/dashboard";

function hasEnv(...keys: string[]) {
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export const isGoogleConfigured = hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");

export const isEnterpriseSsoConfigured = hasEnv(
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET"
);

function enterpriseOidcProvider() {
  const issuer = process.env.OIDC_ISSUER!;
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
    // Always include a no-op provider so NextAuth never has an empty providers[].
    // This is not shown in UI (we use pages.signIn="/signin").
    Credentials({
      id: "disabled",
      name: "Disabled",
      credentials: {},
      async authorize() {
        return null;
      },
    }),

    ...(isGoogleConfigured
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),

    ...(isEnterpriseSsoConfigured ? [enterpriseOidcProvider() as any] : []),
  ],

  pages: {
    signIn: "/signin",
  },

  session: { strategy: "jwt" },

  callbacks: {
    /**
     * Force post-auth navigation to the Admin Dashboard, regardless of callbackUrl.
     *
     * Note:
     * - NextAuth uses redirect() for various flows (sign-in, sign-out, error pages).
     * - We only hard-force to admin for normal post-sign-in redirects.
     */
    async redirect({ url, baseUrl }) {
      // If NextAuth is trying to send the user to sign-in or error pages, keep it in-app.
      // Otherwise, force to admin dashboard.
      try {
        const u = new URL(url, baseUrl);

        // If this is a sign-out flow, send to home (or keep baseUrl).
        if (u.pathname.startsWith("/api/auth/signout")) return baseUrl;

        // If redirecting to auth system pages, don't break them.
        if (
          u.pathname.startsWith("/api/auth") ||
          u.pathname === "/signin" ||
          u.pathname === "/api/auth/error"
        ) {
          return `${baseUrl}${u.pathname}${u.search}`;
        }
      } catch {
        // ignore parsing issues; fall through to forcing admin
      }

      return `${baseUrl}${POST_SIGN_IN_PATH}`;
    },
  },
};
