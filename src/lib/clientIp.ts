const MAX_IP_HEADER_VALUE_LEN = 256;
const MAX_IP_VALUE_LEN = 64;
const IPV4_PART_RE = /^\d{1,3}$/;
const IPV6_CANDIDATE_RE = /^[0-9a-f:.]+$/i;

function truthyEnv(name: string): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!IPV4_PART_RE.test(part)) return false;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
  }
  return true;
}

function isLikelyIpv6(value: string): boolean {
  if (!value.includes(":")) return false;
  if (value.length > 39) return false;
  if (!IPV6_CANDIDATE_RE.test(value)) return false;
  const colonCount = (value.match(/:/g) || []).length;
  return colonCount >= 2;
}

function normalizeIp(value: string | null | undefined): string | null {
  let raw = String(value || "").trim().slice(0, MAX_IP_HEADER_VALUE_LEN);
  if (!raw || /[\r\n\0]/.test(raw)) return null;

  if (raw.startsWith('"') && raw.endsWith('"') && raw.length > 1) {
    raw = raw.slice(1, -1).trim();
  }
  if (raw.toLowerCase().startsWith("for=")) {
    raw = raw.slice(4).trim();
  }
  if (!raw) return null;

  let host = raw;
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close <= 1) return null;
    host = host.slice(1, close).trim();
  } else if (host.includes(".") && host.includes(":") && host.indexOf(":") === host.lastIndexOf(":")) {
    host = host.split(":", 1)[0]?.trim() || "";
  }

  host = host.trim().toLowerCase();
  if (!host || host.length > MAX_IP_VALUE_LEN) return null;
  if (isValidIpv4(host) || isLikelyIpv6(host)) return host;
  return null;
}

function firstForwarded(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() || "";
  return normalizeIp(first);
}

function platformProxyHeadersTrusted(): boolean {
  if (truthyEnv("TRUST_PLATFORM_PROXY_HEADERS")) return true;
  // Managed platforms set these in production deployments.
  return truthyEnv("VERCEL") || truthyEnv("CF_PAGES") || truthyEnv("CF_WORKER");
}

function genericProxyHeadersTrusted(): boolean {
  return truthyEnv("TRUST_PROXY_HEADERS");
}

function shouldTrustProxyHeaders(): { platform: boolean; generic: boolean } {
  if (process.env.NODE_ENV !== "production") {
    // Local/test/dev environments typically run behind ad-hoc proxies.
    return { platform: true, generic: true };
  }
  return {
    platform: platformProxyHeadersTrusted(),
    generic: genericProxyHeadersTrusted(),
  };
}

export function getTrustedClientIpFromHeaders(headers: Headers): string | null {
  const trust = shouldTrustProxyHeaders();

  if (trust.platform) {
    const cf = normalizeIp(headers.get("cf-connecting-ip"));
    if (cf) return cf;

    const vercel = firstForwarded(headers.get("x-vercel-forwarded-for"));
    if (vercel) return vercel;
  }

  if (trust.generic) {
    const xff = firstForwarded(headers.get("x-forwarded-for"));
    if (xff) return xff;

    const xRealIp = normalizeIp(headers.get("x-real-ip"));
    if (xRealIp) return xRealIp;
  }

  return null;
}
