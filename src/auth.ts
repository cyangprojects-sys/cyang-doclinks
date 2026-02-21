import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { OAuthConfig, OIDCConfig } from "next-auth/providers";

/**
 * Enterprise SSO (Bring-Your-Own OIDC)
 *
 * Configure in your hosting environment:
 *   OIDC_ISSUER=https://<your-idp>/.well-known/openid-configuration (or issuer base URL)
 *   OIDC_CLIENT_ID=...
 *   OIDC_CLIENT_SECRET=...
 *
 * Recommended (Vercel):
 *   AUTH_URL=https://www.cyang.io
 *   AUTH_SECRET=... (long random)
 *   AUTH_TRUST_HOST=true
 */

function hasEnv(...keys: string[]) {
  return keys.every((k) => !!process.env[k] && process.env[k]!.trim().length > 0);
}

/**
 * Generic OIDC provider (single-tenant config via env).
 * Businesses “bring their own” by setting these env vars.
 */
function enterpriseOidcProvider(): OAuthConfig<any> | null {
  if (!hasEnv("OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET")) return null;

  const issuer = process.env.OIDC_ISSUER!.trim();

  // NextAuth supports OIDC via a custom OAuth config.
  // We keep it simple: issuer + client creds; discovery handled via issuer.
  const provider: OAuthConfig<any> = {
    id: "enterprise-sso",
    name: "Enterprise SSO",
    type: "oidc",
    issuer,
    clientId: process.env.OIDC_CLIENT_ID!,
    clientSecret: process.env.OIDC_CLIENT_SECRET!,
    // Request only what we need; many IdPs require 'openid'
    authorization: { params: { scope: "openid email profile" } },
    // Some IdPs require PKCE + state; NextAuth enables these by default for OIDC.
  };

  return provider;
}

const providers = [] as any[];

// Always include a safe fallback provider so /api/auth/signin never 500s due to
// "no providers configured". We do NOT expose it in the UI.
providers.push(
  Credentials({
    id: "disabled",
    name: "Disabled",
    credentials: {},
    async authorize() {
      // Never allow credential login; this exists only to keep NextAuth stable
      // when enterprise OIDC is not configured yet.
      return null;
    },
  })
);

// Conditionally enable Enterprise OIDC
const enterprise = enterpriseOidcProvider();
if (enterprise) providers.push(enterprise);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,

  // Force our custom sign-in chooser page
  pages: {
    signIn: "/signin",
  },

  session: {
    strategy: "jwt",
  },

  callbacks: {
    /**
     * Keep redirects safe and predictable.
     */
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const u = new URL(url);
        if (u.origin === baseUrl) return url;
      } catch {
        // ignore
      }
      return `${baseUrl}/dashboard`;
    },

    /**
     * Ensure we have a stable user identity inside the app.
     * If you already map users in your DB elsewhere, keep your existing logic.
     */
    async jwt({ token, profile }) {
      // If the provider returns email, persist it on token
      const anyProfile = profile as any;
      if (!token.email && anyProfile?.email) token.email = anyProfile.email;
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).email = token.email as string | undefined;
      }
      return session;
    },
  },
});
