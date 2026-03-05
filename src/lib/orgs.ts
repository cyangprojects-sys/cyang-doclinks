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
  const slug = String(s || "").trim().toLowerCase();
  if (!slug || slug.length > 63 || /[\r\n\0]/.test(slug)) return "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return "";
  return slug;
}

function normalizeDomain(value: unknown): string | null {
  const raw = String(value || "");
  if (/[\r\n\0]/.test(raw)) return null;
  const domain = raw.trim().toLowerCase();
  if (!domain || domain.length > 253) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return null;
  return domain;
}

function emailDomain(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 320 || /[\r\n\0]/.test(email)) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return normalizeDomain(email.slice(at + 1));
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
    allowedDomains: Array.from(
      new Set((r.allowed_domains || []).map((d) => normalizeDomain(d)).filter((d): d is string => Boolean(d)))
    ),
  };
}

export function orgAllowsEmail(org: Org, emailRaw: string): boolean {
  const domain = emailDomain(emailRaw);
  if (!domain) return false;
  if (!org.allowedDomains?.length) return true; // if not configured, allow all (you can tighten later)
  return org.allowedDomains
    .map((d) => normalizeDomain(d))
    .filter((d): d is string => Boolean(d))
    .includes(domain);
}

export function getDecryptedClientSecret(org: Org): string | null {
  if (!org.oidcClientSecretEnc) return null;
  try {
    return decryptSecret(org.oidcClientSecretEnc);
  } catch {
    return null;
  }
}
