import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { ensureUserByEmail } from "@/lib/authz";
import { getOrgBySlug, getDecryptedClientSecret, orgAllowsEmail } from "@/lib/orgs";

function isNonEmpty(v: string | undefined | null): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeIssuer(raw: string): string {
  return raw.replace(/\/+\$/, "");
}

function buildEnterpriseProvider(opts: {
  issuer: string;
  clientId: string;
  clientSecret: string;
}) {
  return {
    id: "enterprise-oidc",
    name: "Enterprise SSO",
    type: "oauth",
    wellKnown: `${normalizeIssuer(opts.issuer)}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: "openid email profile",
      },
    },
    idToken: true,
    checks: ["pkce", "state"],
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    profile(profile: any) {
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
  } as any;
}

/**
 * Multi-tenant (Option 2) auth options.
 * - If `orgSlug` maps to an organization with OIDC enabled, we add the enterprise provider
 *   from the database (encrypted secret at rest).
 * - If no orgSlug is present, we fall back to the legacy single-tenant env var provider.
 */
export async function buildAuthOptions(orgSlug: string | null): Promise<NextAuthOptions> {
  const providers: any[] = [];

  // Always allow Google (global OAuth)
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  );

  // Prefer per-org enterprise config (Option 2)
  let orgIdForLogin: string | null = null;

  if (orgSlug) {
    const org = await getOrgBySlug(orgSlug);
    if (org && org.oidcEnabled && isNonEmpty(org.oidcIssuer) && isNonEmpty(org.oidcClientId)) {
      const secret = getDecryptedClientSecret(org);
      if (secret) {
        providers.push(
          buildEnterpriseProvider({
            issuer: org.oidcIssuer,
            clientId: org.oidcClientId,
            clientSecret: secret,
          })
        );
        orgIdForLogin = org.id;
      }
    }
  }

  // Legacy single-tenant enterprise provider via env vars (kept for back-compat)
  if (
    !providers.some((p) => p?.id === "enterprise-oidc") &&
    isNonEmpty(process.env.ENTERPRISE_OIDC_ISSUER) &&
    isNonEmpty(process.env.ENTERPRISE_OIDC_CLIENT_ID) &&
    isNonEmpty(process.env.ENTERPRISE_OIDC_CLIENT_SECRET)
  ) {
    providers.push(
      buildEnterpriseProvider({
        issuer: process.env.ENTERPRISE_OIDC_ISSUER,
        clientId: process.env.ENTERPRISE_OIDC_CLIENT_ID,
        clientSecret: process.env.ENTERPRISE_OIDC_CLIENT_SECRET,
      })
    );
  }

  const authOptions: NextAuthOptions = {
    providers,

    session: { strategy: "jwt" },
    secret: process.env.NEXTAUTH_SECRET,

    callbacks: {
      async session({ session, token }) {
        if (session?.user) {
          session.user.email = token.email as string;
          (session.user as any).id = (token as any).uid ?? null;
          (session.user as any).role = (token as any).role ?? null;
          (session.user as any).orgId = (token as any).orgId ?? null;
          (session.user as any).orgSlug = (token as any).orgSlug ?? null;
        }
        return session;
      },

      async jwt({ token, account, profile }) {
        // On sign-in: upsert user and store id/role/org in JWT.
        if (account && profile) {
          const email = (profile as any).email as string | undefined;
          if (email) {
            token.email = email;

            // If orgSlug provided, bind this sign-in to that org.
            const orgSlugFromCookie = orgSlug ?? null;
            let orgId: string | null = orgIdForLogin;

            if (orgSlugFromCookie && !orgId) {
              const org = await getOrgBySlug(orgSlugFromCookie);
              orgId = org?.id ?? null;

              // Enforce optional allowlist.
              if (org && !orgAllowsEmail(org, email)) {
                throw new Error("EMAIL_DOMAIN_NOT_ALLOWED");
              }
            }

            const u = await ensureUserByEmail(email, { orgId, orgSlug: orgSlugFromCookie });
            (token as any).uid = u.id;
            (token as any).role = u.role;
            (token as any).orgId = u.orgId;
            (token as any).orgSlug = u.orgSlug;
          }
        }

        // Older tokens may not have uid/role/org.
        if (token?.email && (!(token as any).uid || !(token as any).role || !(token as any).orgId)) {
          const u = await ensureUserByEmail(String(token.email), {
            orgId: (token as any).orgId ?? null,
            orgSlug: (token as any).orgSlug ?? orgSlug ?? null,
          });
          (token as any).uid = u.id;
          (token as any).role = u.role;
          (token as any).orgId = u.orgId;
          (token as any).orgSlug = u.orgSlug;
        }

        return token;
      },
    },
  };

  return authOptions;
}

// Back-compat: a default (no-org) authOptions export.
// NOTE: In V3 multi-tenant mode, prefer buildAuthOptions() with org cookie.
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
        (session.user as any).id = (token as any).uid ?? null;
        (session.user as any).role = (token as any).role ?? null;
        (session.user as any).orgId = (token as any).orgId ?? null;
        (session.user as any).orgSlug = (token as any).orgSlug ?? null;
      }
      return session;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const email = (profile as any).email as string | undefined;
        if (email) {
          token.email = email;
          const u = await ensureUserByEmail(email, { orgId: null, orgSlug: null });
          (token as any).uid = u.id;
          (token as any).role = u.role;
          (token as any).orgId = u.orgId;
          (token as any).orgSlug = u.orgSlug;
        }
      }
      if (token?.email && (!(token as any).uid || !(token as any).role)) {
        const u = await ensureUserByEmail(String(token.email), { orgId: null, orgSlug: null });
        (token as any).uid = u.id;
        (token as any).role = u.role;
        (token as any).orgId = u.orgId;
        (token as any).orgSlug = u.orgSlug;
      }
      return token;
    },
  },
};
