import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// NOTE: This project serves untrusted viewer traffic.
// We set conservative, production-safe security headers globally.
// If you later embed docs in iframes, you'll need to relax frame-ancestors / X-Frame-Options.

function cspValue() {
  // Keep this CSP compatible with Next.js + PDF rendering.
  // We allow https: for images/connect (e.g., fonts/analytics) and blob: for PDF rendering.
  // "unsafe-eval" is included to avoid accidental breakage (some builds/tooling may rely on it).
  const parts = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'self' 'unsafe-inline' https:",
  ];

  // Do not add upgrade-insecure-requests in dev/local.
  if (isProd) parts.push("upgrade-insecure-requests");

  return parts.join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    const headers: Array<{ key: string; value: string }> = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      { key: "Content-Security-Policy", value: cspValue() },
    ];

    if (isProd) {
      // 2 years, preload-ready.
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },
};

export default nextConfig;
