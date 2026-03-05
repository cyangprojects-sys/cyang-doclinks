// src/lib/tenant.ts
import { cookies } from "next/headers";

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

/**
 * Returns org slug from cookie, or null.
 * This cookie is set by /org/[slug]/auth/* routes (Option 2 routing).
 *
 * Note: In Next.js 16.1.x, `cookies()` is typed as possibly returning a Promise.
 * At runtime in Route Handlers / Server Components it is available synchronously,
 * but we cast here to keep this helper usable from non-async call sites.
 */
export function getOrgSlugFromCookies(): string | null {
  try {
    const c = cookies() as unknown as { get?: (name: string) => { value?: string } | undefined };
    const v = c.get?.(ORG_COOKIE_NAME)?.value ?? "";
    return normalizeOrgSlug(v);
  } catch {
    return null;
  }
}
