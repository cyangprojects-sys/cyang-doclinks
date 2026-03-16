/**
 * Canonical public demo document link for cyang.io.
 *
 * Keep all demo CTAs pointing here so you can rotate the token in one place.
 */
export const CANONICAL_DEMO_DOC_URL = "https://www.cyang.io/s/5925b6744c38f9c6fd76efcac5fcc255";

export function normalizeDemoDocUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.trim().toLowerCase();
    const path = url.pathname.trim();
    if (url.protocol !== "https:") return null;
    if (host !== "www.cyang.io") return null;
    if (!path.startsWith("/s/") || path.includes("/raw")) return null;
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

function assertSafeDemoDocUrl(value: string): string {
  const normalized = normalizeDemoDocUrl(value);
  if (!normalized) throw new Error("Invalid demo URL");
  return normalized;
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

