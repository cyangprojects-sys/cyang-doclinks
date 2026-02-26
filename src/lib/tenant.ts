// src/lib/tenant.ts
import { cookies } from "next/headers";

export const ORG_COOKIE_NAME = "cyang_org";
export const ORG_INVITE_COOKIE_NAME = "cyang_org_invite";

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
    const slug = String(v || "").trim().toLowerCase();
    return slug ? slug : null;
  } catch {
    return null;
  }
}
