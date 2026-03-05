/**
 * Canonical public demo document link for cyang.io.
 *
 * Keep all demo CTAs pointing here so you can rotate the token in one place.
 */
const CANONICAL_DEMO_DOC_URL = "https://www.cyang.io/s/e7601639ef9e473fb38659988e4eaa18";

function assertSafeDemoDocUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.trim().toLowerCase();
  const path = url.pathname.trim();
  if (url.protocol !== "https:") throw new Error("Invalid demo URL protocol");
  if (host !== "www.cyang.io") throw new Error("Invalid demo URL host");
  if (!path.startsWith("/s/") || path.includes("/raw")) throw new Error("Invalid demo URL path");
  return `${url.origin}${path}`;
}

export const DEMO_DOC_URL = assertSafeDemoDocUrl(CANONICAL_DEMO_DOC_URL);

