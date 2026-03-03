function truthyEnv(name: string): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function firstForwarded(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() || "";
  return first || null;
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
    const cf = String(headers.get("cf-connecting-ip") || "").trim();
    if (cf) return cf;

    const vercel = firstForwarded(headers.get("x-vercel-forwarded-for"));
    if (vercel) return vercel;
  }

  if (trust.generic) {
    const xff = firstForwarded(headers.get("x-forwarded-for"));
    if (xff) return xff;

    const xRealIp = String(headers.get("x-real-ip") || "").trim();
    if (xRealIp) return xRealIp;
  }

  return null;
}
