import NextAuth from "next-auth";
import OIDC from "next-auth/providers/oidc";
import Credentials from "next-auth/providers/credentials";

/**
 * Enterprise SSO (BYO OIDC)
 *
 * This auth setup is designed to be safe even when SSO is not configured yet:
 * - The OIDC provider is only registered when *all* required env vars exist.
 * - A disabled Credentials provider is always registered to prevent NextAuth from
 *   crashing when providers[] is empty (common cause of /api/auth/signin 500s).
 *
 * Required env vars to enable Enterprise SSO:
 * - OIDC_ISSUER
 * - OIDC_CLIENT_ID
 * - OIDC_CLIENT_SECRET
 *
 * Required auth env vars (Vercel):
 * - AUTH_URL (e.g. https://www.cyang.io)
 * - AUTH_SECRET (long random)
 * - AUTH_TRUST_HOST=true (recommended on Vercel)
 */

function hasEnv(...keys: string[]) {
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

const enterpriseConfigured = hasEnv("OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET");

const providers = [
  // Always include a no-op provider so NextAuth never has an empty providers[].
  // We do NOT expose this in our UI (we use pages.signIn="/signin").
  Credentials({
    id: "disabled",
    name: "Disabled",
    credentials: {},
    async authorize() {
      return null;
    },
  }),
];

if (enterpriseConfigured) {
  providers.push(
    OIDC({
      id: "enterprise-sso",
      name: "Enterprise SSO",
      issuer: process.env.OIDC_ISSUER!,
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,

  // Always route users to our custom chooser page
  pages: {
    signIn: "/signin",
  },

  // Keep things simple and reliable for deployments
  session: { strategy: "jwt" },

  callbacks: {
    async redirect({ url, baseUrl }) {
      // Allow relative URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allow same-origin absolute URLs
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // ignore
      }
      return `${baseUrl}/dashboard`;
    },
  },
});

export type EnterpriseAuthConfigured = typeof enterpriseConfigured;
export const isEnterpriseSsoConfigured = enterpriseConfigured;
