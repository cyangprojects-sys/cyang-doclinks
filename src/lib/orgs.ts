// src/lib/orgs.ts
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/cryptoSecrets";

export type Org = {
  id: string;
  slug: string;
  name: string | null;
  oidcEnabled: boolean;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecretEnc: string | null;
  allowedDomains: string[]; // lowercased
};

function normSlug(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export async function getOrgBySlug(slugRaw: string): Promise<Org | null> {
  const slug = normSlug(slugRaw);
  if (!slug) return null;

  const rows = (await sql`
    select
      id::text as id,
      slug::text as slug,
      name::text as name,
      coalesce(oidc_enabled, false) as oidc_enabled,
      oidc_issuer::text as oidc_issuer,
      oidc_client_id::text as oidc_client_id,
      oidc_client_secret_enc::text as oidc_client_secret_enc,
      coalesce(allowed_domains, '{}'::text[]) as allowed_domains
    from public.organizations
    where slug = ${slug}
    limit 1
  `) as unknown as Array<{
    id: string;
    slug: string;
    name: string | null;
    oidc_enabled: boolean;
    oidc_issuer: string | null;
    oidc_client_id: string | null;
    oidc_client_secret_enc: string | null;
    allowed_domains: string[];
  }>;

  const r = rows?.[0];
  if (!r?.id) return null;

  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    oidcEnabled: !!r.oidc_enabled,
    oidcIssuer: r.oidc_issuer,
    oidcClientId: r.oidc_client_id,
    oidcClientSecretEnc: r.oidc_client_secret_enc,
    allowedDomains: (r.allowed_domains || []).map((d) => String(d || "").trim().toLowerCase()).filter(Boolean),
  };
}

export function orgAllowsEmail(org: Org, emailRaw: string): boolean {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!email) return false;
  if (!org.allowedDomains?.length) return true; // if not configured, allow all (you can tighten later)
  const domain = email.split("@")[1] || "";
  return org.allowedDomains.includes(domain);
}

export function getDecryptedClientSecret(org: Org): string | null {
  if (!org.oidcClientSecretEnc) return null;
  return decryptSecret(org.oidcClientSecretEnc);
}
