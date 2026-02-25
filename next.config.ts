import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// NOTE: This project serves untrusted viewer traffic.
// We set conservative, production-safe security headers globally.
// Viewer/embed routes (/d/*, /serve/*) are allowed to be framed ONLY by this site (frame-ancestors 'self').

function cspValue(opts?: { frameAncestors?: string }) {
  // Keep this CSP compatible with Next.js + PDF rendering.
  // We allow https: for images/connect (e.g., fonts/analytics) and blob: for PDF rendering.
  // "unsafe-eval" is included to avoid accidental breakage (some builds/tooling may rely on it).
  const frameAncestors = opts?.frameAncestors ?? "'none'";

  const parts = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
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
    const common: Array<{ key: string; value: string }> = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
    ];

    const strictHeaders: Array<{ key: string; value: string }> = [
      ...common,
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: cspValue({ frameAncestors: "'none'" }) },
    ];

    // Allow our own pages to embed the doc viewer in an iframe.
    // IMPORTANT: This is still locked to SAME-ORIGIN (XFO) and 'self' (CSP).
    const viewerEmbedHeaders: Array<{ key: string; value: string }> = [
      ...common,
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: cspValue({ frameAncestors: "'self'" }) },
    ];

    if (isProd) {
      const hsts = {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      };
      strictHeaders.push(hsts);
      viewerEmbedHeaders.push(hsts);
    }

    return [
      // Strict by default, but EXCLUDE viewer/embed routes so we can override them below.
      {
        source: "/((?!serve|d).*)",
        headers: strictHeaders,
      },

      // Viewer routes: allow framing by 'self' only (so /d/* can iframe /serve/*).
      {
        source: "/serve/:path*",
        headers: viewerEmbedHeaders,
      },
      {
        source: "/d/:path*",
        headers: viewerEmbedHeaders,
      },
    ];
  },
};

export default nextConfig;
