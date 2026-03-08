/**
 * Canonical public demo document link for cyang.io.
 *
 * Keep all demo CTAs pointing here so you can rotate the token in one place.
 */
const CANONICAL_DEMO_DOC_URL = "https://www.cyang.io/s/5925b6744c38f9c6fd76efcac5fcc255";

function assertSafeDemoDocUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.trim().toLowerCase();
  const path = url.pathname.trim();
  if (url.protocol !== "https:") throw new Error("Invalid demo URL protocol");
  if (host !== "www.cyang.io") throw new Error("Invalid demo URL host");
  if (!path.startsWith("/s/") || path.includes("/raw")) throw new Error("Invalid demo URL path");
  return `${url.origin}${path}`;
}

function configuredDemoDocUrl(): string {
  const raw =
    String(process.env.DEMO_DOC_URL || "").trim() ||
    String(process.env.NEXT_PUBLIC_DEMO_DOC_URL || "").trim() ||
    CANONICAL_DEMO_DOC_URL;
  try {
    return assertSafeDemoDocUrl(raw);
  } catch {
    return assertSafeDemoDocUrl(CANONICAL_DEMO_DOC_URL);
  }
}

export function getDemoShareToken(): string | null {
  try {
    const url = new URL(configuredDemoDocUrl());
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (parts[0] !== "s") return null;
    const token = String(parts[1] || "").trim();
    if (!/^[A-Za-z0-9_-]{8,256}$/.test(token)) return null;
    return token;
  } catch {
    return null;
  }
}

export const DEMO_DOC_URL = configuredDemoDocUrl();

