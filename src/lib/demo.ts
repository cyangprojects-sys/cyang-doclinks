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

export function getConfiguredDemoDocUrl(): string | null {
  const raw = String(process.env.DEMO_DOC_URL || "").trim();
  if (!raw) return null;
  try {
    return assertSafeDemoDocUrl(raw);
  } catch {
    return null;
  }
}

export function getDemoShareToken(): string | null {
  try {
    const configured = getConfiguredDemoDocUrl();
    if (!configured) return null;
    const url = new URL(configured);
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

export const DEMO_DOC_URL = getConfiguredDemoDocUrl();

