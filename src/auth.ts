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
 * Owner role:
 * - We compute `user.role` into the session so server layouts can hide/show owner-only nav.
 * - Set OWNER_EMAILS (comma-separated) or OWNER_EMAIL in Vercel to control who is "owner".
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
 *
 * Owner allowlist:
 * - OWNER_EMAILS="a@x.com,b@y.com"  (recommended)
 *   OR
 * - OWNER_EMAIL="a@x.com"
 */

const POST_SIGN_IN_PATH = "/admin/dashboard";

const useSecureCookies =
  (process.env.NEXTAUTH_URL || "").toLowerCase().startsWith("https://") ||
  (process.env.VERCEL || "").toLowerCase() === "1" ||
  (process.env.VERCEL_ENV || "").length > 0;

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

function parseOwnerEmails(): Set<string> {
  const single = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const list = (process.env.OWNER_EMAILS ?? "").trim();

  const emails = new Set<string>();
  if (single) emails.add(single);

  if (list) {
    for (const part of list.split(",")) {
      const e = part.trim().toLowerCase();
      if (e) emails.add(e);
    }
  }
  return emails;
}

const OWNER_EMAIL_SET = parseOwnerEmails();

function computeRole(email?: string | null): "owner" | "viewer" {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return "viewer";

  // If no allowlist is configured, default to viewer for safety.
  if (OWNER_EMAIL_SET.size === 0) return "viewer";

  return OWNER_EMAIL_SET.has(e) ? "owner" : "viewer";
}

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
  // Make cookie security explicit (prod-safe defaults).
  useSecureCookies,
  cookies: useSecureCookies
    ? {
        // Note: __Host- requires Path=/, Secure, and no Domain.
        csrfToken: {
          name: "__Host-next-auth.csrf-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
        sessionToken: {
          name: "__Secure-next-auth.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
        callbackUrl: {
          name: "__Secure-next-auth.callback-url",
          options: {
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
      }
    : undefined,

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
    async jwt({ token, user }) {
      // On first sign-in, `user` is present. Afterwards rely on token.email.
      const email = (user as any)?.email ?? (token as any)?.email ?? null;
      (token as any).role = computeRole(email);
      return token;
    },

    async session({ session, token }) {
      // Expose role to server components (layouts) and client UI if needed.
      (session.user as any).role = (token as any).role ?? "viewer";
      return session;
    },

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
