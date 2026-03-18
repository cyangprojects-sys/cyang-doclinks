// src/lib/tenant.ts
export const ORG_COOKIE_NAME = "cyang_org";
export const ORG_INVITE_COOKIE_NAME = "cyang_org_invite";
const MAX_ORG_SLUG_LEN = 63;

export function normalizeOrgSlug(input: string | null | undefined): string | null {
  const slug = String(input || "").trim().toLowerCase();
  if (!slug) return null;
  if (slug.length > MAX_ORG_SLUG_LEN) return null;
  if (/[\r\n\0]/.test(slug)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return null;
  return slug;
}
