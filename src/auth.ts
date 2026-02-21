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
 * - ALWAYS land on /admin/dashboard after a successful sign-in
 * - Sign-out should land on /
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
     * Force post-auth navigation to the Admin Dashboard for typical sign-in redirects.
     * But DO NOT break sign-out: signOut({ callbackUrl: "/" }) should go home.
     */
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);

        // Allow explicit home redirects (used by sign-out).
        if (u.origin === baseUrl && (u.pathname === "/" || u.pathname === "")) {
          return baseUrl;
        }

        // Keep NextAuth system routes functioning.
        if (u.origin === baseUrl && u.pathname.startsWith("/api/auth")) {
          return `${baseUrl}${u.pathname}${u.search}`;
        }

        // If caller explicitly redirects into /admin, honor it.
        if (u.origin === baseUrl && u.pathname.startsWith("/admin")) {
          return `${baseUrl}${u.pathname}${u.search}`;
        }
      } catch {
        // ignore parsing issues; fall through to forcing admin
      }

      // Default: always send signed-in users to the admin dashboard
      return `${baseUrl}${POST_SIGN_IN_PATH}`;
    },
  },
};
