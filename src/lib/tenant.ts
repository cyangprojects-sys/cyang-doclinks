// src/lib/tenant.ts
import { cookies } from "next/headers";

export const ORG_COOKIE_NAME = "cyang_org";

/**
 * Returns org slug from cookie, or null.
 * This cookie is set by /org/[slug]/auth/* routes (Option 2 routing).
 */
export function getOrgSlugFromCookies(): string | null {
  try {
    const v = cookies().get(ORG_COOKIE_NAME)?.value ?? "";
    const slug = String(v || "").trim().toLowerCase();
    return slug ? slug : null;
  } catch {
    return null;
  }
}
